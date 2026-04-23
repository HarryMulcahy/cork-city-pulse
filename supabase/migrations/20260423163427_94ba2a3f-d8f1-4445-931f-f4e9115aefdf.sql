-- Roles enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'city_mod', 'developer', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  city_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, city_name)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_approver(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'city_mod', 'developer')
  )
$$;

-- RLS: anyone can view roles (so UI can show badges); only admins/mods can grant
CREATE POLICY "Roles viewable by everyone"
  ON public.user_roles FOR SELECT USING (true);

CREATE POLICY "Admins can insert any role"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "City mods can grant city_mod role"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'city_mod')
    AND role = 'city_mod'
  );

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-grant admin to the very first signup
CREATE OR REPLACE FUNCTION public.grant_first_user_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_grant_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_first_user_admin();

-- Approval workflow on developments
ALTER TABLE public.developments
  ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN approved_by UUID,
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN rejection_reason TEXT;

-- Existing rows: mark as approved so they don't disappear
UPDATE public.developments SET approval_status = 'approved', approved_at = now();

-- Update SELECT policy: public sees only approved; submitter + approvers see all
DROP POLICY IF EXISTS "Developments viewable by everyone" ON public.developments;

CREATE POLICY "Approved developments viewable by everyone"
  ON public.developments FOR SELECT
  USING (
    approval_status = 'approved'
    OR auth.uid() = user_id
    OR public.is_approver(auth.uid())
  );

-- Approvers can update approval state on any development
CREATE POLICY "Approvers can update approval status"
  ON public.developments FOR UPDATE
  USING (public.is_approver(auth.uid()));

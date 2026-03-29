
CREATE POLICY "Admins can update applications"
ON public.esek_patur_applications FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all users (e.g. for rider list/detail)
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

-- Allow admins to update any user (e.g. is_active for rider deactivation)
CREATE POLICY "Admins can update any user" ON users
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'admin')
  );

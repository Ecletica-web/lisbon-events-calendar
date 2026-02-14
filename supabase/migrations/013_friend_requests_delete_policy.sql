-- Allow either party to delete (cancel pending request OR unfriend)
DROP POLICY IF EXISTS "Requester can delete own pending request" ON friend_requests;
CREATE POLICY "Either party can delete friend row" ON friend_requests
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

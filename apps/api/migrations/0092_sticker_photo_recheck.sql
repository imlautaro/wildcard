-- The first face check only accepted real human faces and refused cartoon, pixel-art and robot
-- avatars. Forget those "no face" verdicts so the corrected check runs again (stickers/tools.ts
-- also expires a "no" after six hours). Positive verdicts stay valid.
DELETE FROM sticker_photo_check WHERE has_face = 0;

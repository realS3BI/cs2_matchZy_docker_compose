namespace Playbook;

public static class ReviewPhotoFraming
{
    public static uint HiddenHud(string slot) => slot is "front" or "effect" ? 4u | 128u | 256u : 128u;
    public const uint FieldOfView = 90;
    // Keep the real player's aim; cancel only the camera's inherited pitch.
    public static float CameraPitch(float playerPitch) => -Math.Clamp(playerPitch, -89f, 89f);
}

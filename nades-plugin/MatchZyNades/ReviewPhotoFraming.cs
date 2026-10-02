namespace MatchZyNades;

public readonly record struct ReviewFrontPose(Coordinates Position, Coordinates Angles, Coordinates ModelAngles);
public readonly record struct ReviewCameraTrace(float Fraction, bool StartSolid = false);

public static class ReviewPhotoFraming
{
    public static uint HiddenHud(string slot) => slot is "front" or "effect" ? 4u | 128u | 256u : 128u;
    public const uint FieldOfView = 90;
    public const float CameraDistance = 120f;
    public const float MinimumCameraDistance = 80f;
    public const float CameraHullRadius = 8f;
    private static readonly float[] CameraOffsets = [0, 45, -45, 90, -90, 135, -135, 180];

    public static float NormalizeYaw(float yaw) => (yaw % 360f + 540f) % 360f - 180f;
    public static ReviewFrontPose Front(Coordinates origin, float yaw, bool crouched, float distance = CameraDistance)
    {
        var cameraYaw = NormalizeYaw(yaw);
        var radians = cameraYaw * MathF.PI / 180f;
        return new(new(origin.X - MathF.Cos(radians) * distance, origin.Y - MathF.Sin(radians) * distance,
                origin.Z + (crouched ? 32f : 48f)),
            new(0, cameraYaw, 0), new(0, NormalizeYaw(cameraYaw + 180f), 0));
    }

    // Trace the camera's volume from the player toward each candidate, before
    // creating the preview model. Never put the lens beyond the first wall.
    public static ReviewFrontPose? FindFront(Coordinates origin, float yaw, bool crouched,
        Func<Coordinates, Coordinates, ReviewCameraTrace> trace)
    {
        ReviewFrontPose? best = null;
        var bestDistance = 0f;
        var start = origin with { Z = origin.Z + (crouched ? 32f : 48f) };
        foreach (var offset in CameraOffsets) {
            var pose = Front(origin, yaw + offset, crouched);
            var hit = trace(start, pose.Position);
            if (hit.StartSolid || !float.IsFinite(hit.Fraction) || hit.Fraction is < 0 or > 1) continue;
            var distance = hit.Fraction == 1 ? CameraDistance : CameraDistance * hit.Fraction - 4f;
            if (distance < MinimumCameraDistance || distance <= bestDistance) continue;
            best = Front(origin, yaw + offset, crouched, distance);
            bestDistance = distance;
            if (distance == CameraDistance) break;
        }
        return best;
    }
}

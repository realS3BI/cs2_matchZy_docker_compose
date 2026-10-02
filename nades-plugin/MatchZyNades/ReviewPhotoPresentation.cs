using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace MatchZyNades;

public readonly record struct ReviewFrontPose(Coordinates Position, Coordinates Angles, Coordinates PlayerAngles);

public static class ReviewPhotoFraming
{
    // Aim and position retain the real crosshair; front and effect suppress it.
    // The local photo-mode command hides the remaining HUD and viewmodel.
    public static uint HiddenHud(string slot) => slot is "front" or "effect" ? 4u | 128u | 256u : 128u;
    public const uint FieldOfView = 90;
    public static float NormalizeYaw(float yaw) => (yaw % 360f + 540f) % 360f - 180f;
    public static bool SameAngles(Coordinates a, Coordinates b) => Math.Abs(a.X - b.X) < .5f &&
        Math.Abs(NormalizeYaw(a.Y - b.Y)) < .5f && Math.Abs(a.Z - b.Z) < .5f;
    public static ReviewFrontPose Front(Coordinates origin, float yaw, bool crouched)
    {
        // Stand on the approach side of the lineup, away from its aiming wall.
        // Turn the actual player toward this fixed camera for the short photo.
        var cameraYaw = NormalizeYaw(yaw);
        var radians = cameraYaw * MathF.PI / 180f;
        var height = crouched ? 32f : 48f;
        return new(new(origin.X - MathF.Cos(radians) * 120f, origin.Y - MathF.Sin(radians) * 120f, origin.Z + height),
            new(0, cameraYaw, 0), new(0, NormalizeYaw(cameraYaw + 180f), 0));
    }
}

// Owns only a short photo interval on the original pawn. The reviewer imports
// the crosshair in CS2; the browser only crops the actual game image.
internal sealed class ReviewPhotoPresentation : IDisposable
{
    private readonly CCSPlayerPawn _pawn;
    private readonly uint _hud;
    private readonly uint _photoHud;
    private readonly bool _front;
    private readonly Coordinates? _eyeAngles;
    private readonly bool _wasFrozen;
    private readonly Coordinates _frontAngles;
    private readonly Coordinates? _bodyRotation, _bodyAbsRotation;
    private readonly uint _view;
    private readonly CCSPlayerBase_CameraServices _cameraServices;
    private readonly uint _fov, _fovStart;
    private readonly float _fovTime, _fovRate;
    private readonly MoveType_t _move, _actualMove;
    private readonly float _nextAttack;
    private readonly float _attackLock = Server.CurrentTime + 45f;
    private CDynamicProp? _camera;
    private bool _frontPoseApplied;
    private bool _disposed;
    public uint PawnHandle { get; }

    public ReviewPhotoPresentation(CCSPlayerPawn pawn, string slot, float frontYaw)
    {
        _pawn = pawn;
        PawnHandle = pawn.EntityHandle.Raw;
        _cameraServices = pawn.CameraServices?.As<CCSPlayerBase_CameraServices>()
            ?? throw new InvalidOperationException("Die Spielkamera ist noch nicht bereit.");
        _hud = pawn.HideHUD;
        _front = slot == "front";
        _wasFrozen = (pawn.Flags & (uint)PlayerFlags.FL_FROZEN) != 0;
        if (_front) _eyeAngles = new(pawn.EyeAngles.X, pawn.EyeAngles.Y, pawn.EyeAngles.Z);
        if (_front && pawn.CBodyComponent?.SceneNode is { } body) {
            _bodyRotation = new(body.Rotation.X, body.Rotation.Y, body.Rotation.Z);
            _bodyAbsRotation = new(body.AbsRotation.X, body.AbsRotation.Y, body.AbsRotation.Z);
        }
        _photoHud = _hud | ReviewPhotoFraming.HiddenHud(slot);
        _view = _cameraServices.ViewEntity.Raw;
        _fov = _cameraServices.FOV; _fovStart = _cameraServices.FOVStart;
        _fovTime = _cameraServices.FOVTime; _fovRate = _cameraServices.FOVRate;
        _move = pawn.MoveType; _actualMove = pawn.ActualMoveType;
        _nextAttack = pawn.WeaponServices!.As<CCSPlayer_WeaponServices>().NextAttack;
        if (_cameraServices.ViewEntity.IsValid) throw new InvalidOperationException("Bitte zuerst die andere aktive Kamera beenden.");
        try {
            pawn.HideHUD = _photoHud;
            Utilities.SetStateChanged(pawn, "CBasePlayerPawn", "m_iHideHUD");
            if (_front) {
                _cameraServices.FOV = ReviewPhotoFraming.FieldOfView;
                _cameraServices.FOVStart = ReviewPhotoFraming.FieldOfView;
                _cameraServices.FOVRate = 0;
                _cameraServices.FOVTime = Server.CurrentTime;
            }
            pawn.MoveType = MoveType_t.MOVETYPE_NONE;
            pawn.ActualMoveType = MoveType_t.MOVETYPE_NONE;
            pawn.WeaponServices.As<CCSPlayer_WeaponServices>().NextAttack = _attackLock;
            Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
            if (slot == "front") {
                var origin = pawn.AbsOrigin ?? throw new InvalidOperationException("Die Spielerposition ist nicht verfügbar.");
                var pose = ReviewPhotoFraming.Front(new(origin.X, origin.Y, origin.Z), frontYaw,
                    pawn.MovementServices!.As<CCSPlayer_MovementServices>().Ducked);
                _frontAngles = pose.PlayerAngles;
                _frontPoseApplied = true;
                pawn.Flags |= (uint)PlayerFlags.FL_FROZEN;
                Utilities.SetStateChanged(pawn, "CBaseEntity", "m_fFlags");
                // Teleport updates the client's actual view/animation direction.
                // Scene-node yaw alone does not reliably turn the local model.
                pawn.Teleport(null, new QAngle(_frontAngles.X, _frontAngles.Y, _frontAngles.Z), new Vector());
                Maintain();
                _camera = Utilities.CreateEntityByName<CDynamicProp>("prop_dynamic")
                    ?? throw new InvalidOperationException("Die Review-Kamera konnte nicht erstellt werden.");
                _camera.Spawnflags = 256; // Invisible, model-less, non-colliding camera entity.
                _camera.DispatchSpawn();
                _camera.Teleport(new Vector(pose.Position.X, pose.Position.Y, pose.Position.Z),
                    new QAngle(pose.Angles.X, pose.Angles.Y, pose.Angles.Z), new Vector());
                _cameraServices.ViewEntity.Raw = _camera.EntityHandle.Raw;
            }
            Utilities.SetStateChanged(pawn, "CBasePlayerPawn", "m_pCameraServices");
        } catch { Dispose(); throw; }
    }

    public void Maintain()
    {
        if (_disposed || !_frontPoseApplied || !_pawn.IsValid) return;
        var eyes = new Coordinates(_pawn.EyeAngles.X, _pawn.EyeAngles.Y, _pawn.EyeAngles.Z);
        if (!ReviewPhotoFraming.SameAngles(eyes, _frontAngles))
            _pawn.Teleport(null, new QAngle(_frontAngles.X, _frontAngles.Y, _frontAngles.Z), new Vector());
        if (_pawn.CBodyComponent?.SceneNode is not { } scene) return;
        scene.Rotation.X = scene.Rotation.Z = scene.AbsRotation.X = scene.AbsRotation.Z = 0;
        scene.Rotation.Y = scene.AbsRotation.Y = _frontAngles.Y;
        Utilities.SetStateChanged(_pawn, "CBaseEntity", "m_CBodyComponent");
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try {
            if (!_pawn.IsValid || _pawn.EntityHandle.Raw != PawnHandle) return;
            var body = _pawn.CBodyComponent?.SceneNode;
            var ownsBody = _frontPoseApplied && body != null &&
                Math.Abs(ReviewPhotoFraming.NormalizeYaw(body.Rotation.Y - _frontAngles.Y)) < .5f;
            if (_camera is { IsValid: true } && _cameraServices.ViewEntity.Raw == _camera.EntityHandle.Raw)
                _cameraServices.ViewEntity.Raw = _view;
            if (_frontPoseApplied) {
                if (!_wasFrozen) {
                    _pawn.Flags &= ~(uint)PlayerFlags.FL_FROZEN;
                    Utilities.SetStateChanged(_pawn, "CBaseEntity", "m_fFlags");
                }
                if (_eyeAngles is { } eyes && ReviewPhotoFraming.SameAngles(new(_pawn.EyeAngles.X, _pawn.EyeAngles.Y, _pawn.EyeAngles.Z), _frontAngles))
                    _pawn.Teleport(null, new QAngle(eyes.X, eyes.Y, eyes.Z), new Vector());
            }
            if (ownsBody && _bodyRotation is { } local && _bodyAbsRotation is { } absolute && body is { } scene) {
                scene.Rotation.X = local.X; scene.Rotation.Y = local.Y; scene.Rotation.Z = local.Z;
                scene.AbsRotation.X = absolute.X; scene.AbsRotation.Y = absolute.Y; scene.AbsRotation.Z = absolute.Z;
                Utilities.SetStateChanged(_pawn, "CBaseEntity", "m_CBodyComponent");
            }
            if (_pawn.HideHUD == _photoHud) _pawn.HideHUD = _hud;
            Utilities.SetStateChanged(_pawn, "CBasePlayerPawn", "m_iHideHUD");
            if (_front && _cameraServices.FOV == ReviewPhotoFraming.FieldOfView) {
                _cameraServices.FOV = _fov; _cameraServices.FOVStart = _fovStart;
                _cameraServices.FOVTime = _fovTime; _cameraServices.FOVRate = _fovRate;
            }
            Utilities.SetStateChanged(_pawn, "CBasePlayerPawn", "m_pCameraServices");
            if (_pawn.MoveType == MoveType_t.MOVETYPE_NONE) {
                _pawn.MoveType = _move; _pawn.ActualMoveType = _actualMove;
                Utilities.SetStateChanged(_pawn, "CBaseEntity", "m_MoveType");
            }
            if (_pawn.WeaponServices is { } services && services.As<CCSPlayer_WeaponServices>().NextAttack == _attackLock)
                services.As<CCSPlayer_WeaponServices>().NextAttack = Math.Max(_nextAttack, Server.CurrentTime + .15f);
        } finally {
            if (_camera is { IsValid: true }) _camera.Remove();
            _camera = null;
        }
    }
}

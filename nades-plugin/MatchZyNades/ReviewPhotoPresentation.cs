using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace MatchZyNades;

public readonly record struct ReviewCameraPose(Coordinates Position, Coordinates Angles);

public static class ReviewPhotoFraming
{
    public const uint HiddenHud = 4 | 128 | 256; // All HUD, chat and the player's crosshair.
    public const uint FieldOfView = 90;
    public static ReviewCameraPose Front(Coordinates origin, float yaw, bool crouched)
    {
        // Same distance, height and field of view for every front photo.
        var radians = yaw * MathF.PI / 180f;
        var height = crouched ? 32f : 48f;
        return new(new(origin.X + MathF.Cos(radians) * 120f, origin.Y + MathF.Sin(radians) * 120f, origin.Z + height),
            new(0, (yaw + 360f) % 360f - 180f, 0));
    }
}

// Owns only a short photo interval on the original pawn. Local crosshair cvars
// never change; the browser adds the standard crosshair to the captured frame.
internal sealed class ReviewPhotoPresentation : IDisposable
{
    private readonly CCSPlayerPawn _pawn;
    private readonly uint _hud;
    private readonly uint _view;
    private readonly CCSPlayerBase_CameraServices _cameraServices;
    private readonly uint _fov, _fovStart;
    private readonly float _fovTime, _fovRate;
    private readonly MoveType_t _move, _actualMove;
    private readonly float _nextAttack;
    private readonly float _attackLock = Server.CurrentTime + 45f;
    private CDynamicProp? _camera;
    private bool _disposed;
    public uint PawnHandle { get; }

    public ReviewPhotoPresentation(CCSPlayerPawn pawn, string slot, float frontYaw)
    {
        _pawn = pawn;
        PawnHandle = pawn.EntityHandle.Raw;
        _cameraServices = pawn.CameraServices?.As<CCSPlayerBase_CameraServices>()
            ?? throw new InvalidOperationException("Die Spielkamera ist noch nicht bereit.");
        _hud = pawn.HideHUD;
        _view = _cameraServices.ViewEntity.Raw;
        _fov = _cameraServices.FOV; _fovStart = _cameraServices.FOVStart;
        _fovTime = _cameraServices.FOVTime; _fovRate = _cameraServices.FOVRate;
        _move = pawn.MoveType; _actualMove = pawn.ActualMoveType;
        _nextAttack = pawn.WeaponServices!.As<CCSPlayer_WeaponServices>().NextAttack;
        if (_cameraServices.ViewEntity.IsValid) throw new InvalidOperationException("Bitte zuerst die andere aktive Kamera beenden.");
        try {
            pawn.HideHUD = _hud | ReviewPhotoFraming.HiddenHud;
            Utilities.SetStateChanged(pawn, "CBasePlayerPawn", "m_iHideHUD");
            _cameraServices.FOV = ReviewPhotoFraming.FieldOfView;
            _cameraServices.FOVStart = ReviewPhotoFraming.FieldOfView;
            _cameraServices.FOVRate = 0;
            _cameraServices.FOVTime = Server.CurrentTime;
            pawn.MoveType = MoveType_t.MOVETYPE_NONE;
            pawn.ActualMoveType = MoveType_t.MOVETYPE_NONE;
            pawn.WeaponServices.As<CCSPlayer_WeaponServices>().NextAttack = _attackLock;
            Utilities.SetStateChanged(pawn, "CBaseEntity", "m_MoveType");
            if (slot == "front") {
                var origin = pawn.AbsOrigin ?? throw new InvalidOperationException("Die Spielerposition ist nicht verfügbar.");
                var pose = ReviewPhotoFraming.Front(new(origin.X, origin.Y, origin.Z), frontYaw,
                    pawn.MovementServices!.As<CCSPlayer_MovementServices>().Ducked);
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

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try {
            if (!_pawn.IsValid || _pawn.EntityHandle.Raw != PawnHandle) return;
            if (_pawn.HideHUD == (_hud | ReviewPhotoFraming.HiddenHud)) _pawn.HideHUD = _hud;
            Utilities.SetStateChanged(_pawn, "CBasePlayerPawn", "m_iHideHUD");
            if (_camera is { IsValid: true } && _cameraServices.ViewEntity.Raw == _camera.EntityHandle.Raw)
                _cameraServices.ViewEntity.Raw = _view;
            if (_cameraServices.FOV == ReviewPhotoFraming.FieldOfView) {
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

using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;
using System.Drawing;

namespace MatchZyNades;

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
    private readonly uint _view;
    private readonly CCSPlayerBase_CameraServices _cameraServices;
    private readonly uint _fov, _fovStart;
    private readonly float _fovTime, _fovRate;
    private readonly MoveType_t _move, _actualMove;
    private readonly float _nextAttack;
    private readonly float _attackLock = Server.CurrentTime + 45f;
    private CDynamicProp? _camera;
    private uint _cameraHandle = uint.MaxValue;
    private ReviewFrontModel? _frontModel;
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
                _frontPoseApplied = true;
                pawn.Flags |= (uint)PlayerFlags.FL_FROZEN;
                Utilities.SetStateChanged(pawn, "CBaseEntity", "m_fFlags");
                _frontModel = new ReviewFrontModel(pawn, frontYaw);
                var pose = _frontModel.Pose;
                _camera = Utilities.CreateEntityByName<CDynamicProp>("prop_dynamic")
                    ?? throw new InvalidOperationException("Die Review-Kamera konnte nicht erstellt werden.");
                _cameraHandle = _camera.EntityHandle.Raw;
                _camera.Spawnflags = 256;
                _camera.DispatchSpawn();
                // Model-less props can display an ERROR model on the client.
                // Explicitly hide it so it cannot obstruct the camera image.
                _camera.RenderMode = RenderMode_t.kRenderTransAlpha;
                _camera.Render = Color.FromArgb(0, 255, 255, 255);
                if (_camera.CBodyComponent?.SceneNode?.GetSkeletonInstance() is { } cameraSkeleton) cameraSkeleton.Scale = 0;
                Utilities.SetStateChanged(_camera, "CBaseModelEntity", "m_nRenderMode");
                Utilities.SetStateChanged(_camera, "CBaseModelEntity", "m_clrRender");
                Utilities.SetStateChanged(_camera, "CBaseEntity", "m_CBodyComponent");
                _camera.Teleport(new Vector(pose.Position.X, pose.Position.Y, pose.Position.Z),
                    new QAngle(pose.Angles.X, pose.Angles.Y, pose.Angles.Z), new Vector());
                _cameraServices.ViewEntity.Raw = _camera.EntityHandle.Raw;
            }
            Utilities.SetStateChanged(pawn, "CBasePlayerPawn", "m_pCameraServices");
        } catch { Dispose(); throw; }
    }

    public bool Maintain()
    {
        if (_disposed || !_pawn.IsValid) return false;
        return !_front || _camera is { IsValid: true } && _cameraServices.ViewEntity.Raw == _cameraHandle && _frontModel?.Maintain() == true;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try {
            if (!_pawn.IsValid || _pawn.EntityHandle.Raw != PawnHandle) return;
            // Restore even if a map/plugin removed our camera entity already.
            var ownsCamera = _cameraHandle != uint.MaxValue && _cameraServices.ViewEntity.Raw == _cameraHandle;
            if (ownsCamera) _cameraServices.ViewEntity.Raw = _view;
            if (_frontPoseApplied) {
                if (!_wasFrozen) {
                    _pawn.Flags &= ~(uint)PlayerFlags.FL_FROZEN;
                    Utilities.SetStateChanged(_pawn, "CBaseEntity", "m_fFlags");
                }
                if (ownsCamera && _eyeAngles is { } eyes && _pawn.Health > 0) {
                    _pawn.Teleport(null, new QAngle(eyes.X, eyes.Y, eyes.Z), new Vector());
                    PlayerBodyRotation.Repair(_pawn);
                }
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
            try { _frontModel?.Dispose(); }
            finally {
                _frontModel = null;
                if (_camera is { IsValid: true }) _camera.Remove();
                _camera = null;
            }
        }
    }
}

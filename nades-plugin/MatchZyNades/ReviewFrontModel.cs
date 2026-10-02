using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;
using System.Drawing;

namespace MatchZyNades;

// A local player's rendered animation can follow the external camera despite
// server-side eye/scene angles. Use a separate, unparented model for the photo.
// Model-view reference: https://github.com/spitice/cs2-external-view
internal sealed class ReviewFrontModel : IDisposable
{
    private sealed record HiddenEntity(CBaseModelEntity Entity, uint Handle, Color Color, RenderMode_t Mode);
    private static readonly Color Transparent = Color.FromArgb(0, 255, 255, 255);
    private readonly List<HiddenEntity> _hidden = [];
    private readonly Coordinates _origin;
    private readonly Coordinates _angles;
    private CPhysicsPropOverride? _model;
    private bool _disposed;
    public ReviewFrontPose Pose { get; }

    public ReviewFrontModel(CCSPlayerPawn pawn, float yaw)
    {
        var origin = pawn.AbsOrigin ?? throw new InvalidOperationException("Die Spielerposition ist nicht verfügbar.");
        _origin = new(origin.X, origin.Y, origin.Z);
        var skeleton = pawn.CBodyComponent?.SceneNode?.GetSkeletonInstance();
        var modelName = skeleton?.ModelState.ModelName;
        if (string.IsNullOrWhiteSpace(modelName))
            throw new InvalidOperationException("Das Charaktermodell ist noch nicht verfügbar. Bitte erneut versuchen.");
        var crouched = pawn.MovementServices!.As<CCSPlayer_MovementServices>().Ducked;
        Pose = ReviewPhotoFraming.FindFront(_origin, yaw, crouched, (start, end) => {
            var radius = ReviewPhotoFraming.CameraHullRadius;
            var hit = Trace.TraceHullShape(new(start.X, start.Y, start.Z), new(end.X, end.Y, end.Z),
                new(-radius, -radius, -radius), new(radius, radius, radius), pawn,
                new TraceOptions { InteractsWith = Masks.SolidBrushOnly | Contents.Debris });
            return new(hit.Fraction, hit.IsAllSolid);
        }) ?? throw new InvalidOperationException("Am Startpunkt ist zu wenig Platz für eine freie Vorderansicht. Bitte die Vorderansicht manuell aufnehmen und hochladen.");
        _angles = Pose.ModelAngles;
        try {
            _model = Utilities.CreateEntityByName<CPhysicsPropOverride>("prop_physics_override")
                ?? throw new InvalidOperationException("Das Fotomodell konnte nicht erstellt werden.");
            _model.SetModel(modelName);
            _model.Spawnflags = 2097152; // Physics-prop flag: disable collisions.
            _model.Teleport(new(_origin.X, _origin.Y, _origin.Z), new(_angles.X, _angles.Y, _angles.Z), new Vector());
            _model.DispatchSpawn();
            _model.AcceptInput("DisableMotion");
            _model.MoveType = _model.ActualMoveType = MoveType_t.MOVETYPE_NONE;
            Utilities.SetStateChanged(_model, "CBaseEntity", "m_MoveType");
            if (_model.CBodyComponent?.SceneNode?.GetSkeletonInstance() is { } previewSkeleton) {
                previewSkeleton.ModelState.MeshGroupMask = skeleton!.ModelState.MeshGroupMask;
                previewSkeleton.Scale = skeleton.Scale;
                Utilities.SetStateChanged(_model, "CBaseEntity", "m_CBodyComponent");
            }
            // Hide the actual pawn and its carried weapons only after the
            // independent model exists. Keep exact render settings for cleanup.
            Hide(pawn);
            foreach (var weapon in pawn.WeaponServices!.MyWeapons)
                if (weapon.Value is { IsValid: true } entity) Hide(entity);
        } catch { Dispose(); throw; }
    }

    private void Hide(CBaseModelEntity entity)
    {
        _hidden.Add(new(entity, entity.EntityHandle.Raw, entity.Render, entity.RenderMode));
        entity.RenderMode = RenderMode_t.kRenderTransAlpha;
        entity.Render = Transparent;
        Utilities.SetStateChanged(entity, "CBaseModelEntity", "m_nRenderMode");
        Utilities.SetStateChanged(entity, "CBaseModelEntity", "m_clrRender");
    }

    public bool Maintain()
    {
        if (_disposed || _model is not { IsValid: true }) return false;
        _model.Teleport(new(_origin.X, _origin.Y, _origin.Z), new(_angles.X, _angles.Y, _angles.Z), new Vector());
        return true;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        List<Exception> failures = [];
        try {
            foreach (var saved in _hidden) {
                try {
                    var entity = saved.Entity;
                    // Also restore surviving weapons after death or pawn removal.
                    if (!entity.IsValid || entity.EntityHandle.Raw != saved.Handle) continue;
                    if (entity.Render.ToArgb() == Transparent.ToArgb()) entity.Render = saved.Color;
                    if (entity.RenderMode == RenderMode_t.kRenderTransAlpha) entity.RenderMode = saved.Mode;
                    Utilities.SetStateChanged(entity, "CBaseModelEntity", "m_clrRender");
                    Utilities.SetStateChanged(entity, "CBaseModelEntity", "m_nRenderMode");
                } catch (Exception error) { failures.Add(error); }
            }
        } finally {
            _hidden.Clear();
            try { if (_model is { IsValid: true }) _model.Remove(); }
            catch (Exception error) { failures.Add(error); }
            _model = null;
        }
        if (failures.Count > 0)
            throw new InvalidOperationException("Die Modelldarstellung konnte nicht vollständig wiederhergestellt werden. Bitte neu spawnen.", new AggregateException(failures));
    }
}

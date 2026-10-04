using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace Playbook;

internal sealed class ReviewPawnCrouchState(CCSPlayerPawn pawn, bool duckPressed) : IReviewCrouchState
{
    private readonly uint _handle = pawn.EntityHandle.Raw;
    private readonly CCSPlayer_MovementServices _movement = pawn.MovementServices is { } services
        ? new(services.Handle)
        : throw new InvalidOperationException("Die Spielerbewegung ist noch nicht bereit.");

    public bool IsValid => pawn.IsValid && pawn.EntityHandle.Raw == _handle;
    public bool IsCrouching => duckPressed || _movement.Ducked || _movement.DuckAmount >= .5f ||
        (pawn.Flags & (uint)PlayerFlags.FL_DUCKING) != 0;
    public bool DuckOverride { get => _movement.DuckOverride; set => _movement.DuckOverride = value; }

    public void HoldCrouch()
    {
        _movement.DuckAmount = 1;
        _movement.Ducked = true;
        _movement.Ducking = false;
        pawn.Flags |= (uint)PlayerFlags.FL_DUCKING;
        Utilities.SetStateChanged(pawn, "CBaseEntity", "m_fFlags");
        Utilities.SetStateChanged(pawn, "CBasePlayerPawn", "m_pMovementServices");
    }
}

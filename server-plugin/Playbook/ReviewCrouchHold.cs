namespace Playbook;

public interface IReviewCrouchState
{
    bool IsValid { get; }
    bool IsCrouching { get; }
    bool DuckOverride { get; set; }
    void HoldCrouch();
}

// Snapshot before hiding the panel or loading the lineup. Releasing the hold
// restores input control, rather than issuing -duck and forcing the player up.
public sealed class ReviewCrouchHold(IReviewCrouchState state) : IDisposable
{
    private readonly bool _crouching = state.IsCrouching;
    private readonly bool _override = state.DuckOverride;
    private bool _applied;
    private bool _disposed;

    public void Maintain()
    {
        if (_disposed || !_crouching || !state.IsValid) return;
        _applied = true;
        state.DuckOverride = true;
        state.HoldCrouch();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        if (_applied && state.IsValid && state.DuckOverride)
            state.DuckOverride = _override;
    }
}

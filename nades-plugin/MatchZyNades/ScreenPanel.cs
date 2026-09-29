using System.Drawing;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Utils;

namespace MatchZyNades;

// A private world-text display, following the server's view of the camera each tick.
// Current CS2 no longer exposes predicted_viewmodel; this cannot be client-predicted.
internal sealed class ScreenPanel(CCSPlayerPawn pawn) : IDisposable
{
    private readonly List<CPointWorldText> _text = [];
    private PanelContent? _content;
    private bool _wide;

    public void Draw(PanelContent content, bool wide)
    {
        if (_text.Count != 5 || _text.Any(t => !t.IsValid))
        {
            Dispose();
            Create(wide);
        }
        if (_wide != wide) { Place(wide); _wide = wide; }
        if (_content == content) return;
        var parts = new[] { content.Heading, content.Options, content.Selection, content.Details, content.Controls };
        for (var i = 0; i < parts.Length; i++)
        {
            _text[i].MessageText = parts[i];
            Utilities.SetStateChanged(_text[i], "CPointWorldText", "m_messageText");
        }
        _content = content;
    }

    private void Create(bool wide)
    {
        foreach (var color in new[] { Color.LightSkyBlue, Color.WhiteSmoke, Color.Khaki, Color.WhiteSmoke, Color.LightSkyBlue })
        {
            var entity = Utilities.CreateEntityByName<CPointWorldText>("point_worldtext")
                ?? throw new InvalidOperationException("Could not create panel text.");
            _text.Add(entity);
            entity.MessageText = " ";
            entity.Enabled = true;
            entity.Fullbright = true;
            entity.FontName = "Consolas";
            entity.FontSize = 32;
            entity.WorldUnitsPerPx = 0.006f;
            entity.Color = color;
            entity.JustifyHorizontal = PointWorldTextJustifyHorizontal_t.POINT_WORLD_TEXT_JUSTIFY_HORIZONTAL_LEFT;
            entity.JustifyVertical = PointWorldTextJustifyVertical_t.POINT_WORLD_TEXT_JUSTIFY_VERTICAL_TOP;
            entity.ReorientMode = PointWorldTextReorientMode_t.POINT_WORLD_TEXT_REORIENT_NONE;
            entity.DrawBackground = _text.Count != 3;
            entity.BackgroundBorderWidth = 0.12f;
            entity.BackgroundBorderHeight = 0.08f;
            entity.BackgroundWorldToUV = 0.05f;
            entity.DepthOffset = _text.Count == 3 ? 0.01f : 0;
            entity.DispatchSpawn();
        }
        Place(wide);
        _wide = wide;
    }

    private void Place(bool wide)
    {
        var eye = pawn.EyeAngles;
        Vector forward = new(), right = new(), up = new();
        NativeAPI.AngleVectors(eye.Handle, forward.Handle, right.Handle, up.Handle);
        var origin = pawn.AbsOrigin ?? throw new InvalidOperationException("Player origin unavailable.");
        var camera = origin + new Vector(pawn.ViewOffset.X, pawn.ViewOffset.Y, pawn.ViewOffset.Z);
        var heights = new[] { 2.55f, 1.72f, 1.72f, 0.30f, -1.65f };
        for (var i = 0; i < _text.Count; i++)
        {
            _text[i].Teleport(camera + forward * 7 + right * (wide ? 4.65f : 2.30f) + up * heights[i],
                new QAngle(0, eye.Y + 270, 90 - eye.X), null);
        }
    }

    public void FollowCamera()
    {
        if (_text.Count == 5 && _text.All(t => t.IsValid)) Place(_wide);
    }

    public void ExcludeFrom(CCheckTransmitInfo info)
    {
        foreach (var entity in _text)
            if (entity.IsValid) info.TransmitEntities.Remove(entity);
    }

    public void Dispose()
    {
        foreach (var entity in _text) if (entity.IsValid) entity.Remove();
        _text.Clear();
        _content = null;
    }
}

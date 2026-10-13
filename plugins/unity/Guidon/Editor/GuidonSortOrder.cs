using System.Collections.Generic;
using System.Linq;

namespace Guidon.Tasks.Editor
{
    /// <summary>
    /// Direct C# port of sortOrderForPosition in
    /// src/lib/work/task-board.ts - midpoint insertion so committing a
    /// drag-and-drop move only ever needs to persist the moved card's own
    /// sort_order, never renumber its neighbours. Manual-sync point with
    /// that file, same as GuidonVocabulary's own status/priority lists.
    /// </summary>
    internal static class GuidonSortOrder
    {
        public static float ForPosition(IReadOnlyList<TaskDto> column, int index, string movingTaskId)
        {
            List<TaskDto> siblings = column.Where(t => t.id != movingTaskId).ToList();

            float? before = index - 1 >= 0 && index - 1 < siblings.Count ? siblings[index - 1].sort_order : (float?)null;
            float? after = index >= 0 && index < siblings.Count ? siblings[index].sort_order : (float?)null;

            if (before == null && after == null) return 1000f;
            if (before == null) return after.Value - 100f;
            if (after == null) return before.Value + 100f;

            float midpoint = (before.Value + after.Value) / 2f;
            // Guards the same edge case the TS version's Number.isFinite
            // check does (there, an overflow to Infinity/NaN when two
            // neighbours are only fractionally apart) - if the midpoint
            // doesn't land strictly between its neighbours, fall back to
            // appending after `before` instead of handing back a value
            // that would sort in the wrong place or collide with one of them.
            return midpoint > before.Value && midpoint < after.Value ? midpoint : before.Value + 100f;
        }
    }
}

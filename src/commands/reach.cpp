/* SPDX-License-Identifier: AGPL-3.0-or-later

Copyright (c) 2026 Adrian Cruceru

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

#include <math.h>

#include "arm_args.h"
#include "arm.h"
#include "arm_reach.h"
#include "reach.h"

bool Reach::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view piece;
    int32_t x = 0;
    int32_t y = 0;
    int32_t z = 0;
    int32_t pitch = 0;

    if (!arm_next(args, piece) || !arm_parse_int(piece, x) ||
        !arm_next(args, piece) || !arm_parse_int(piece, y) ||
        !arm_next(args, piece) || !arm_parse_int(piece, z))
    {
        return ctx.reply_fmt((uint32_t)help.size(), "%.*s", (int)help.size(), help.data());
    }

    bool pitch_given = arm_next(args, piece);

    if (pitch_given && !arm_parse_int(piece, pitch))
    {
        return ctx.reply_fmt(144, "pitch is whole degrees from straight up, got [%.*s]", (int)piece.size(), piece.data());
    }

    ArmReach& reach = ArmReach::get();
    const char *why = NULL;
    const char *missed = NULL;

    if (!reach.solve(x, y, z, pitch_given, pitch, why))
    {
        missed = why;

        if (!reach.towards(x, y, z, why))
        {
            return ctx.reply_fmt(256, "cannot reach %d,%d,%d: %s, and %s", (int)x, (int)y, (int)z, missed, why);
        }
    }
    else
    {
        reach.m_x = x;
        reach.m_y = y;
        reach.m_z = z;
    }

    if (!reach.go(why))
    {
        return ctx.reply_fmt(112, "not moving: %s", why);
    }

    return ctx.reply_fmt(432, "%s %d,%d,%d mm, pitch %d: pan %d lift %d elbow %d wrist %d%s%s",
                     (missed != NULL) ? "short of it, heading to" : "heading to",
                     (int)lround(reach.m_x), (int)lround(reach.m_y), (int)lround(reach.m_z), (int)lround(reach.m_pitch),
                     (int)lround(reach.m_q[0]), (int)lround(reach.m_q[1]), (int)lround(reach.m_q[2]), (int)lround(reach.m_q[3]),
                     (missed != NULL) ? " - all the way is " : "", (missed != NULL) ? missed : "");
}

bool Where::on_header(CommandContext& ctx)
{
    ArmManager& arm = ArmManager::get();
    ArmReach& reach = ArmReach::get();
    const char *why = NULL;
    char text[384];

    int pos = snprintf(text, sizeof(text), "now joints");

    for (uint32_t joint = 0; (joint < arm.count()) && (pos < (int)sizeof(text)); ++joint)
    {
        int32_t deci = ArmManager::position_to_deci(arm.joint(joint).state.position);

        pos += (arm.joint(joint).present && arm.joint(joint).state_valid)
            ? snprintf(&text[pos], sizeof(text) - pos, "/%s%d.%d", ((deci < 0) && (deci > -10)) ? "-" : "", (int)(deci / 10), (int)(((deci < 0) ? -deci : deci) % 10))
            : snprintf(&text[pos], sizeof(text) - pos, "/-");
    }

    if (pos < (int)sizeof(text))
    {
        pos += reach.where(why)
            ? snprintf(&text[pos], sizeof(text) - pos,
                       "; jaws at %d,%d,%d mm (x forward, y sideways, z up from the floor), pitch %d (0 up, 90 level, 180 down)",
                       (int)lround(reach.m_x), (int)lround(reach.m_y), (int)lround(reach.m_z), (int)lround(reach.m_pitch))
            : snprintf(&text[pos], sizeof(text) - pos, "; jaws not known: %s", why);
    }

    return ctx.reply(text);
}

MQTT_COMMAND(Reach);
WS_COMMAND(Reach);
TELEGRAM_COMMAND(Reach);
AI_COMMAND(Reach);

uint32_t PosesWhereLines::line(uint32_t index, char *out, uint32_t size)
{
    PoseStore& poses = ArmManager::get().poses();
    ArmReach& reach = ArmReach::get();
    const char *why = NULL;
    int pos = 0;

    if (index == MAX_POSES)
    {
        return (poses.count() == 0) ? (uint32_t)snprintf(out, size, "no poses saved\n") : 0;
    }

    const Pose *stored = poses.at(index);

    if ((stored == NULL) || !stored->used)
    {
        return 0;
    }

    pos = snprintf(out, size, "%s: joints", stored->name);

    for (uint32_t joint = 0; (joint < ArmManager::count()) && (pos > 0) && (pos < (int)size); ++joint)
    {
        int32_t deci = ArmManager::position_to_deci(stored->position[joint]);

        pos += stored->has(joint)
            ? snprintf(&out[pos], size - pos, "/%s%d.%d", ((deci < 0) && (deci > -10)) ? "-" : "", (int)(deci / 10), (int)(((deci < 0) ? -deci : deci) % 10))
            : snprintf(&out[pos], size - pos, "/-");
    }

    if ((pos > 0) && (pos < (int)size) && stored->has(0) && stored->has(1) && stored->has(2) && stored->has(3) &&
        reach.forward(stored->position, why))
    {
        pos += snprintf(&out[pos], size - pos, ", jaws at %d,%d,%d mm, pitch %d",
                        (int)lround(reach.m_x), (int)lround(reach.m_y), (int)lround(reach.m_z), (int)lround(reach.m_pitch));
    }

    if ((stored->description[0] != 0) && (pos > 0) && (pos < (int)size))
    {
        pos += snprintf(&out[pos], size - pos, " - %s", stored->description);
    }

    if ((pos > 0) && (pos < ((int)size - 1)))
    {
        out[pos++] = '\n';
    }

    return (pos <= 0) ? 0 : (((uint32_t)pos < size) ? (uint32_t)pos : size - 1);
}

MQTT_COMMAND(PosesWhere);
WS_COMMAND(PosesWhere);
TELEGRAM_COMMAND(PosesWhere);
AI_COMMAND(PosesWhere);
AI_CONTEXT(PosesWhere);

MQTT_COMMAND(Where);
WS_COMMAND(Where);
TELEGRAM_COMMAND(Where);
AI_COMMAND(Where);
AI_CONTEXT(Where);

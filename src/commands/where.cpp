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

#include "arm.h"
#include "arm_reach.h"
#include "where.h"

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

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

#include "arm_args.h"
#include "calibrate.h"

bool Calibrate::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view joint_text;
    std::string_view what;
    int found = 0;

    if (!arm_next(args, joint_text) || !arm_next(args, what))
    {
        return ctx.reply("expected calibrate/<joint>/<start|finish|cancel|center>");
    }

    if (!arm_parse_joint(ctx, joint_text, found))
    {
        return true;
    }

    if (found == ArmManager::ALL_JOINTS)
    {
        return ctx.reply("one joint at a time");
    }

    ArmManager& arm = ArmManager::get();
    uint32_t index = (uint32_t)found;
    const ArmJoint& joint = arm.joint(index);

    if (!joint.present)
    {
        return ctx.reply_fmt(144, "%s: not plugged in - run scan once it is", joint.name);
    }

    if (what == "start")
    {
        if (!arm.calibrate_start(index))
        {
            return ctx.reply_fmt(128, "%s: did not go limp", joint.name);
        }

        return ctx.reply_fmt(160, "%s: limp - hold the arm up and move the joint to both ends", joint.name);
    }

    if (what == "finish")
    {
        std::string_view margin_text;
        int32_t margin = 20;

        if (arm_next(args, margin_text) && !arm_parse_int(margin_text, margin))
        {
            return ctx.reply_fmt(128, "[%.*s] is not a margin", (int)margin_text.size(), margin_text.data());
        }

        if ((margin < 0) || (margin > 500))
        {
            return ctx.reply("a margin is 0..500 steps");
        }

        if (!arm.calibrate_finish(index, (uint16_t)margin))
        {
            return ctx.reply_fmt(224, "%s: not taken - the joint barely moved, or its travel crosses the "
                                   "servo's 4095/0 edge: center it and calibrate again", joint.name);
        }

        return ctx.reply_fmt(144, "%s: limits %u..%u", joint.name,
                         (unsigned int)arm.servo(index).min_position(),
                         (unsigned int)arm.servo(index).max_position());
    }

    if (what == "cancel")
    {
        arm.calibrate_cancel(index);
        return ctx.reply_fmt(112, "%s: left as it was", joint.name);
    }

    if (what == "center")
    {
        if (!arm.set_middle_here(index))
        {
            return ctx.reply_fmt(128, "%s: did not take it", joint.name);
        }

        return ctx.reply_fmt(160, "%s: here is the middle now, limits gone - calibrate it", joint.name);
    }

    return ctx.reply_fmt(144, "[%.*s]? start, finish, cancel or center", (int)what.size(), what.data());
}

bool Limits::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view joint_text;
    std::string_view min_text;
    int found = 0;

    if (!arm_next(args, joint_text) || !arm_next(args, min_text))
    {
        return ctx.reply("expected limits/<joint>/<min>/<max>, or limits/<joint>/clear");
    }

    if (!arm_parse_joint(ctx, joint_text, found) || (found == ArmManager::ALL_JOINTS))
    {
        return (found == ArmManager::ALL_JOINTS) ? ctx.reply("one joint at a time") : true;
    }

    ArmManager& arm = ArmManager::get();
    uint32_t index = (uint32_t)found;
    const ArmJoint& joint = arm.joint(index);

    if (min_text == "clear")
    {
        return ctx.reply_fmt(208, "%s: %s", joint.name,
                         arm.clear_limits(index) ? "no limits, so no moving either" : "did not take it");
    }

    std::string_view max_text;
    int32_t min = 0;
    int32_t max = 0;

    if (!arm_next(args, max_text) || !arm_parse_int(min_text, min) || !arm_parse_int(max_text, max))
    {
        return ctx.reply("expected limits/<joint>/<min>/<max>");
    }

    if ((min < 0) || (max > ST3215_MAX_POSITION) || (min >= max))
    {
        return ctx.reply_fmt(48, "limits are 0..%u, min below max", (unsigned int)ST3215_MAX_POSITION);
    }

    if (!arm.set_limits(index, (uint16_t)min, (uint16_t)max))
    {
        return ctx.reply_fmt(128, "%s: did not take it", joint.name);
    }

    return ctx.reply_fmt(144, "%s: limits %d..%d", joint.name, (int)min, (int)max);
}

MQTT_COMMAND(Calibrate);
WS_COMMAND(Calibrate);

MQTT_COMMAND(Limits);
WS_COMMAND(Limits);

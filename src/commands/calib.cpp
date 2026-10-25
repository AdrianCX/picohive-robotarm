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

#include <stdio.h>

#include "arm_args.h"
#include "calib.h"
#include "pico_logger.h"

static bool reply_state(CommandContext& ctx, std::string_view name, const char *said)
{
    ArmManager& arm = ArmManager::get();
    const ArmCalibration& calibration = arm.calibration().get();

    char text[480] = {};
    int pos = snprintf(text, sizeof(text), "{\"said\":\"%s\",\"known\":%u,\"joints\":[", said,
                       calibration.known() ? 1u : 0u);

    for (uint32_t index = 0; (index < ArmManager::count()) && (pos > 0) && (pos < (int)sizeof(text)); ++index)
    {
        int written = snprintf(&text[pos], sizeof(text) - pos,
                               "%s{\"zero\":%d,\"dir\":%d,\"scale\":%d}",
                               (index > 0) ? "," : "",
                               (int)calibration.zero[index], (int)calibration.direction[index],
                               (int)calibration.scale_of(index));

        if (written < 0)
        {
            break;
        }

        pos += written;
    }

    if ((pos > 0) && (pos < (int)sizeof(text)))
    {
        snprintf(&text[pos], sizeof(text) - pos, "]}");
    }

    return ctx.reply(text);
}

bool Calib::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view what;

    ArmManager& arm = ArmManager::get();

    if (!arm_next(args, what))
    {
        return reply_state(ctx, name, "stored");
    }

    if (what == "save")
    {
        return reply_state(ctx, name, arm.calibration().save() ? "saved" : "could not write it");
    }

    if (what == "forget")
    {
        arm.calibration().forget();
        return reply_state(ctx, name, "forgotten");
    }

    if (what != "set")
    {
        return ctx.reply_fmt(128, "[%.*s]? set, save or forget", (int)what.size(), what.data());
    }

    std::string_view joint_text;
    std::string_view zero_text;
    std::string_view dir_text;
    std::string_view scale_text;
    int found = 0;
    int32_t zero = 0;
    int32_t direction = 0;
    int32_t scale = 0;

    if (!arm_next(args, joint_text) || !arm_next(args, zero_text) || !arm_next(args, dir_text))
    {
        return ctx.reply(
                         "expected calib/set/<joint>/<zero degrees>/<+1 or -1>[/<scale thousandths>]");
    }

    if (arm_next(args, scale_text) && !arm_parse_int(scale_text, scale))
    {
        return ctx.reply("a scale is in thousandths, 1000 being one for one");
    }

    if ((scale != 0) && ((scale < 500) || (scale > 2000)))
    {
        return ctx.reply_fmt(80, "a scale of %d thousandths is not a calibration, it is a mistake",
                         (int)scale);
    }

    if (!arm_parse_joint(ctx, joint_text, found))
    {
        return true;
    }

    if (found == ArmManager::ALL_JOINTS)
    {
        return ctx.reply("one joint at a time");
    }

    if (!arm_parse_deci(zero_text, zero) || !arm_parse_int(dir_text, direction))
    {
        return ctx.reply("expected calib/set/<joint>/<zero degrees>/<+1 or -1>");
    }

    if ((direction != 1) && (direction != -1))
    {
        return ctx.reply_fmt(48, "a direction is +1 or -1, not %d", (int)direction);
    }

    ArmCalibration calibration = arm.calibration().get();

    calibration.zero[(uint32_t)found] = (int16_t)zero;
    calibration.direction[(uint32_t)found] = (int8_t)direction;
    calibration.scale[(uint32_t)found] = (int16_t)scale;
    arm.calibration().set(calibration);

    return reply_state(ctx, name, "set");
}

MQTT_COMMAND(Calib);
WS_COMMAND(Calib);

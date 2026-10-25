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
#include "move.h"
#include "pico_logger.h"

typedef bool (*JointAction)(ArmManager& arm, uint32_t index, int32_t value);

static bool apply(CommandContext& ctx, int found, int32_t value, JointAction action)
{
    ArmManager& arm = ArmManager::get();

    if (found != ArmManager::ALL_JOINTS)
    {
        uint32_t index = (uint32_t)found;
        const char *why = arm.blocked(index);

        if (why != NULL)
        {
            return ctx.reply_fmt(208, "%s: %s", arm.joint(index).name, why);
        }

        if (!action(arm, index, value))
        {
            return ctx.reply_fmt(112, "%s did not take it", arm.joint(index).name);
        }

        return ctx.reply_fmt(112, "%s: ok", arm.joint(index).name);
    }

    uint32_t moved = 0;

    for (uint32_t index = 0; index < arm.count(); ++index)
    {
        if ((arm.blocked(index) == NULL) && action(arm, index, value))
        {
            ++moved;
        }
    }

    return ctx.reply_fmt(48, "%u of %u joints", (unsigned int)moved, (unsigned int)arm.count());
}

static bool parse(CommandContext& ctx, int& found, int32_t& value, bool degrees)
{
    std::string_view args = ctx.args;
    std::string_view joint_text;
    std::string_view value_text;

    if (!arm_next(args, joint_text) || !arm_next(args, value_text))
    {
        ctx.reply_fmt(128, "expected %.*s/<joint>/<value>", (int)ctx.name.size(), ctx.name.data());
        return false;
    }

    if (!arm_parse_joint(ctx, joint_text, found))
    {
        return false;
    }

    bool parsed = degrees ? arm_parse_deci(value_text, value) : arm_parse_int(value_text, value);

    if (!parsed)
    {
        ctx.reply_fmt(128, "[%.*s] is not a number", (int)value_text.size(), value_text.data());
        return false;
    }

    return true;
}

bool Move::on_header(CommandContext& ctx)
{
    int found = 0;
    int32_t deci = 0;

    if (!parse(ctx, found, deci, true))
    {
        return true;
    }

    std::string_view args = ctx.args;
    std::string_view skip;
    std::string_view speed_text;
    int32_t speed = 0;

    arm_next(args, skip);
    arm_next(args, skip);

    if (!arm_next(args, speed_text))
    {
        return apply(ctx, found, deci, [](ArmManager& arm, uint32_t index, int32_t value) {
            return arm.move_deci(index, value);
        });
    }

    if (!arm_parse_int(speed_text, speed) || (speed < 1) || (speed > ST3215_MAX_SPEED))
    {
        return ctx.reply_fmt(48, "a speed is 1..%u steps/s", (unsigned int)ST3215_MAX_SPEED);
    }

    static uint16_t s_speed;
    s_speed = (uint16_t)speed;

    return apply(ctx, found, deci, [](ArmManager& arm, uint32_t index, int32_t value) {
        return arm.move_deci_at(index, value, s_speed);
    });
}

bool Jog::on_header(CommandContext& ctx)
{
    int found = 0;
    int32_t deci = 0;

    if (!parse(ctx, found, deci, true))
    {
        return true;
    }

    return apply(ctx, found, deci, [](ArmManager& arm, uint32_t index, int32_t value) {
        return arm.jog_deci(index, value);
    });
}

bool Step::on_header(CommandContext& ctx)
{
    int found = 0;
    int32_t position = 0;

    if (!parse(ctx, found, position, false))
    {
        return true;
    }

    if ((position < 0) || (position > ST3215_MAX_POSITION))
    {
        return ctx.reply_fmt(32, "a position is 0..%u", (unsigned int)ST3215_MAX_POSITION);
    }

    return apply(ctx, found, position, [](ArmManager& arm, uint32_t index, int32_t value) {
        return arm.move_position(index, (uint16_t)value);
    });
}

static bool whole_arm(CommandContext& ctx, JointAction action)
{
    std::string_view args = ctx.args;
    std::string_view joint_text;
    int found = ArmManager::ALL_JOINTS;

    if (arm_next(args, joint_text) && !arm_parse_joint(ctx, joint_text, found))
    {
        return true;
    }

    return apply(ctx, found, 0, action);
}

bool Joints::on_header(CommandContext& ctx)
{
    ArmManager& arm = ArmManager::get();
    std::string_view args = ctx.args;
    char text[192];
    int pos = 0;
    uint32_t moved = 0;

    for (uint32_t index = 0; (index < arm.count()) && !args.empty(); ++index)
    {
        size_t split = args.find('/');
        std::string_view piece = args.substr(0, split);
        args = (split == std::string_view::npos) ? std::string_view() : args.substr(split + 1);

        if (piece.empty() || (piece == "-") || (piece == "_"))
        {
            continue;
        }

        int32_t deci = 0;
        const char *why = NULL;

        if (!arm_parse_deci(piece, deci))
        {
            why = "not an angle";
        }
        else if ((why = arm.blocked(index)) == NULL)
        {
            why = arm.move_deci(index, deci) ? NULL : "refused";
        }

        if (why == NULL)
        {
            ++moved;
        }

        if (pos < (int)sizeof(text))
        {
            pos += snprintf(&text[pos], sizeof(text) - pos, "%s%s %.*s%s%s", (pos > 0) ? ", " : "", arm.joint(index).short_name,
                            (int)piece.size(), piece.data(), (why != NULL) ? ": " : "", (why != NULL) ? why : "");
        }

        trace("joints: %s to %.*s%s%s", arm.joint(index).name, (int)piece.size(), piece.data(), (why != NULL) ? ": " : "", (why != NULL) ? why : "");
    }

    if (pos == 0)
    {
        return ctx.reply_fmt((uint32_t)help.size(), "%.*s", (int)help.size(), help.data());
    }

    return ctx.reply_fmt(544, "%u moving - %s", (unsigned int)moved, text);
}

bool Home::on_header(CommandContext& ctx)
{
    return whole_arm(ctx, [](ArmManager& arm, uint32_t index, int32_t) {
        return arm.home(index);
    });
}

bool Stop::on_header(CommandContext& ctx)
{
    ArmManager& arm = ArmManager::get();
    std::string_view args = ctx.args;
    std::string_view joint_text;
    int found = ArmManager::ALL_JOINTS;

    if (arm_next(args, joint_text) && !arm_parse_joint(ctx, joint_text, found))
    {
        return true;
    }

    if (found != ArmManager::ALL_JOINTS)
    {
        return ctx.reply_fmt(208, "%s: %s", arm.joint((uint32_t)found).name,
                         arm.stop((uint32_t)found) ? "stopped" : "did not answer");
    }

    uint32_t stopped = 0;

    for (uint32_t index = 0; index < arm.count(); ++index)
    {
        if (arm.stop(index))
        {
            ++stopped;
        }
    }

    return ctx.reply_fmt(32, "stopped %u joints", (unsigned int)stopped);
}

MQTT_COMMAND(Move);
WS_COMMAND(Move);
AI_COMMAND(Move);

MQTT_COMMAND(Joints);
WS_COMMAND(Joints);
TELEGRAM_COMMAND(Joints);
AI_COMMAND(Joints);

MQTT_COMMAND(Jog);
WS_COMMAND(Jog);
AI_COMMAND(Jog);

MQTT_COMMAND(Step);
WS_COMMAND(Step);

MQTT_COMMAND(Home);
WS_COMMAND(Home);
TELEGRAM_COMMAND(Home);
AI_COMMAND(Home);
CALENDAR_COMMAND(Home);

MQTT_COMMAND(Stop);
WS_COMMAND(Stop);
TELEGRAM_COMMAND(Stop);
AI_COMMAND(Stop);
CALENDAR_COMMAND(Stop);

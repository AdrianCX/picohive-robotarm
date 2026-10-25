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
#include "pico_logger.h"
#include "servo.h"

bool Scan::on_header(CommandContext& ctx)
{
    ArmManager& arm = ArmManager::get();
    uint32_t found = arm.scan();

    char text[288] = {};
    int pos = snprintf(text, sizeof(text), "%u of %u joints:", (unsigned int)found, (unsigned int)arm.count());

    for (uint32_t index = 0; (index < arm.count()) && (pos > 0) && (pos < (int)sizeof(text)); ++index)
    {
        if (arm.joint(index).present)
        {
            pos += snprintf(&text[pos], sizeof(text) - pos, " %s", arm.joint(index).short_name);
        }
    }

    for (uint32_t which = 0; (which < arm.stray_count()) && (pos > 0) && (pos < (int)sizeof(text)); ++which)
    {
        pos += snprintf(&text[pos], sizeof(text) - pos, ", id %u answers but is no joint",
                        (unsigned int)arm.stray(which));
    }

    for (uint32_t which = 0; (which < arm.conflict_count()) && (pos > 0) && (pos < (int)sizeof(text)); ++which)
    {
        pos += snprintf(&text[pos], sizeof(text) - pos,
                        ", id %u answers badly - two servos on it?",
                        (unsigned int)arm.conflict(which));
    }

    return ctx.reply(text);
}

static bool baud_code_of(int32_t asked, uint8_t& code, uint32_t& rate)
{
    for (uint8_t c = 0; c < 8; ++c)
    {
        if ((int32_t)st3215_baud_of(c) == asked)
        {
            code = c;
            rate = st3215_baud_of(c);
            return true;
        }
    }

    if ((asked >= 0) && (asked < 8))
    {
        code = (uint8_t)asked;
        rate = st3215_baud_of(code);
        return true;
    }

    return false;
}

bool Baud::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view joint_text;
    std::string_view rate_text;
    int32_t asked = 0;
    int found = 0;

    if (!arm_next(args, joint_text) || !arm_next(args, rate_text))
    {
        return ctx.reply("expected baud/<joint|all>/<rate>, rate one of 1000000 500000 250000 128000 "
                               "115200 76800 57600 38400");
    }

    if (!arm_parse_joint(ctx, joint_text, found))
    {
        return true;
    }

    uint8_t code = 0;
    uint32_t rate = 0;

    if (!arm_parse_int(rate_text, asked) || !baud_code_of(asked, code, rate) || (rate == 0))
    {
        return ctx.reply_fmt(176, "[%.*s] is not a rate: 1000000 500000 250000 128000 115200 76800 57600 38400",
                         (int)rate_text.size(), rate_text.data());
    }

    ArmManager& arm = ArmManager::get();
    uint32_t was = arm.bus().baudrate();

    if (rate == was)
    {
        return ctx.reply_fmt(48, "the bus is already at %u baud", (unsigned int)rate);
    }

    uint32_t first = (found == ArmManager::ALL_JOINTS) ? 0 : (uint32_t)found;
    uint32_t last = (found == ArmManager::ALL_JOINTS) ? (ArmManager::count() - 1) : (uint32_t)found;
    uint32_t asked_count = 0;
    uint32_t unlocked = 0;

    for (uint32_t index = first; index <= last; ++index)
    {
        if (!arm.joint(index).present)
        {
            continue;
        }

        uint8_t id = arm.joint(index).id;
        ++asked_count;

        if (!arm.bus().write_u8(id, ST3215_REG_LOCK, 0))
        {
            trace("baud: id %d would not unlock its EEPROM, so it is being left where it is", id);
            continue;
        }

        ++unlocked;
        arm.bus().write_u8(id, ST3215_REG_BAUD, code);
    }

    if (unlocked == 0)
    {
        return ctx.reply_fmt(176, "nothing took it: %u joint%s there, and none would unlock its EEPROM",
                         (unsigned int)asked_count, (asked_count == 1) ? "" : "s");
    }

    arm.bus().set_baudrate(rate);

    uint32_t moved = 0;
    uint32_t stayed = 0;

    for (uint32_t index = first; index <= last; ++index)
    {
        if (!arm.joint(index).present)
        {
            continue;
        }

        uint8_t id = arm.joint(index).id;
        uint8_t back = 0xFF;

        if (arm.bus().read_u8(id, ST3215_REG_BAUD, back) && (back == code))
        {
            arm.bus().write_u8(id, ST3215_REG_LOCK, 1);
            ++moved;
        }
    }

    if (moved < unlocked)
    {
        arm.bus().set_baudrate(was);

        for (uint32_t index = first; index <= last; ++index)
        {
            if (!arm.joint(index).present)
            {
                continue;
            }

            uint8_t id = arm.joint(index).id;
            uint8_t back = 0xFF;

            if (arm.bus().read_u8(id, ST3215_REG_BAUD, back))
            {
                arm.bus().write_u8(id, ST3215_REG_LOCK, 1);
                ++stayed;
                trace("baud: id %d is still at %u baud (code %d), EEPROM locked again - move it on its own",
                      id, (unsigned int)was, back);
            }
        }

        arm.bus().set_baudrate((moved >= stayed) ? rate : was);
    }

    arm.scan();

    if (moved == 0)
    {
        return ctx.reply_fmt(176, "none of %u moved to %u baud - they may only change rate on a power cycle. "
                               "The bus is at %u; power cycle the servos and try busbaud/%u",
                         (unsigned int)unlocked, (unsigned int)rate,
                         (unsigned int)arm.bus().baudrate(), (unsigned int)rate);
    }

    if (stayed > 0)
    {
        return ctx.reply_fmt(240, "%u of %u moved to %u baud, %u still at %u and locked again. The bus is at %u. "
                               "Move the stragglers one at a time: busbaud/%u, then baud/<joint>/%u",
                         (unsigned int)moved, (unsigned int)unlocked, (unsigned int)rate,
                         (unsigned int)stayed, (unsigned int)was, (unsigned int)arm.bus().baudrate(),
                         (unsigned int)was, (unsigned int)rate);
    }

    return ctx.reply_fmt(400, "%u of %u servo%s now at %u baud, and so is the bus. Anything not plugged in for "
                           "this is still at %u and will look absent - scanbaud finds it. The next boot talks "
                           "ARM_BAUDRATE, so set that to %u and reflash, or say busbaud/%u each time",
                     (unsigned int)moved, (unsigned int)unlocked, (unlocked == 1) ? "" : "s",
                     (unsigned int)rate, (unsigned int)was, (unsigned int)rate, (unsigned int)rate);
}

bool BusBaud::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view rate_text;
    int32_t asked = 0;

    if (!arm_next(args, rate_text) || !arm_parse_int(rate_text, asked))
    {
        return ctx.reply("expected busbaud/<rate>");
    }

    uint8_t code = 0;
    uint32_t rate = 0;

    if (!baud_code_of(asked, code, rate) || (rate == 0))
    {
        return ctx.reply_fmt(176, "[%.*s] is not a rate: 1000000 500000 250000 128000 115200 76800 57600 38400",
                         (int)rate_text.size(), rate_text.data());
    }

    ArmManager& arm = ArmManager::get();

    if (!arm.bus().set_baudrate(rate))
    {
        return ctx.reply("the bus was never opened");
    }

    uint32_t found = arm.scan();

    return ctx.reply_fmt(112, "the pico speaks %u baud until the next boot: %u of %u joints answer there",
                     (unsigned int)rate, (unsigned int)found, (unsigned int)ArmManager::count());
}

bool Bus::on_header(CommandContext& ctx)
{
    ArmManager& arm = ArmManager::get();
    ST3215Line line;

    if (!arm.bus().line_test(line))
    {
        return ctx.reply("the bus was never opened");
    }

    arm.scan();

    if (!line.rx_idle_high || !line.released_high)
    {
        return ctx.reply("the line is stuck low - it should idle high. A servo holding it down, a short, "
                               "or rx on the wrong pin. Nothing can talk until that is off the bus");
    }

    if (!line.pulled_low)
    {
        return ctx.reply_fmt(384, "the line will not go low: %u baud, %u echo misses, %u uart errors. The pico "
                               "cannot pull the bus under its own threshold through the series resistor, and "
                               "every servo added pulls it up harder - which is why one more stops everything. "
                               "A smaller resistor (220-470R) or a half duplex driver; a stronger pin will not "
                               "do it. The log has the detail",
                         (unsigned int)arm.bus().baudrate(), (unsigned int)arm.bus().echo_misses(),
                         (unsigned int)arm.bus().line_errors());
    }

    return ctx.reply_fmt(176, "the line drives both ways: idle high, pulled low, let go high again. %u baud, "
                           "%u echo misses, %u uart errors. So the levels are not it",
                     (unsigned int)arm.bus().baudrate(), (unsigned int)arm.bus().echo_misses(),
                     (unsigned int)arm.bus().line_errors());
}

bool ScanBaud::on_header(CommandContext& ctx)
{
    char text[256] = {};

    ArmManager& arm = ArmManager::get();
    uint32_t found = arm.scan_baudrates(text, sizeof(text));

    if (found == 0)
    {
        return ctx.reply(text);
    }

    return ctx.reply_fmt(640, "%u answered: %s. Anything not at %u baud is invisible to the arm - the log has "
                           "every id and rate", (unsigned int)found, text,
                     (unsigned int)arm.bus().baudrate());
}

bool SetId::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view from_text;
    std::string_view to_text;
    int32_t from = 0;
    int32_t to = 0;

    if (!arm_next(args, from_text) || !arm_next(args, to_text) || !arm_parse_int(from_text, from))
    {
        return ctx.reply("expected setid/<from>/<to>");
    }

    ArmManager& arm = ArmManager::get();

    if (!arm_parse_int(to_text, to))
    {
        int found = arm.find(to_text);

        if ((found == ArmManager::NO_JOINT) || (found == ArmManager::ALL_JOINTS))
        {
            return ctx.reply("expected setid/<from>/<to>, where <to> is an id or one joint");
        }

        to = arm.joint((uint32_t)found).id;
    }

    if ((from < 1) || (from > 253) || (to < 1) || (to > 253) || (from == to))
    {
        return ctx.reply("ids are 1..253 and have to differ");
    }

    if (!arm.bus().ping((uint8_t)from))
    {
        if (arm.bus().saw_noise())
        {
            return ctx.reply_fmt(144, "id %d answers but not properly - two servos are probably both id %d. "
                                   "Unplug until one of them is left, then rename it", (int)from, (int)from);
        }

        return ctx.reply_fmt(80, "no servo answers to id %d - is it the only one on the bus?", (int)from);
    }

    if (arm.bus().saw_noise())
    {
        return ctx.reply_fmt(160, "id %d answered with something else behind it - two servos are probably both "
                               "id %d, and renaming would move both. Unplug until one is left", (int)from, (int)from);
    }

    if (arm.bus().ping((uint8_t)to))
    {
        return ctx.reply_fmt(64, "id %d is taken - unplug that servo first", (int)to);
    }

    arm.calibrate_cancel_id((uint8_t)from);
    arm.calibrate_cancel_id((uint8_t)to);

    ST3215 servo(arm.bus(), (uint8_t)from);

    if (!servo.set_id((uint8_t)to))
    {
        return ctx.reply_fmt(48, "id %d did not take the change", (int)from);
    }

    arm.scan();

    return ctx.reply_fmt(48, "id %d is now id %d", (int)from, (int)to);
}

bool Torque::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view joint_text;
    std::string_view what;
    int found = 0;

    if (!arm_next(args, joint_text) || !arm_next(args, what))
    {
        return ctx.reply("expected torque/<joint>/<on|off>");
    }

    if (!arm_parse_joint(ctx, joint_text, found))
    {
        return true;
    }

    bool on = ((what == "on") || (what == "1"));

    if (!on && (what != "off") && (what != "0"))
    {
        return ctx.reply_fmt(112, "[%.*s]? on or off", (int)what.size(), what.data());
    }

    ArmManager& arm = ArmManager::get();

    if (found != ArmManager::ALL_JOINTS)
    {
        return ctx.reply_fmt(208, "%s: %s", arm.joint((uint32_t)found).name,
                         arm.set_torque((uint32_t)found, on) ? (on ? "holding" : "limp") : "did not answer");
    }

    uint32_t done = 0;

    for (uint32_t index = 0; index < arm.count(); ++index)
    {
        if (arm.set_torque(index, on))
        {
            ++done;
        }
    }

    return ctx.reply_fmt(128, "%u joints %s", (unsigned int)done, on ? "holding" : "limp");
}

bool Strength::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view joint_text;
    std::string_view percent_text;
    int found = 0;
    int32_t percent = 0;

    if (!arm_next(args, joint_text) || !arm_next(args, percent_text) || !arm_parse_int(percent_text, percent))
    {
        return ctx.reply("expected strength/<joint>/<percent>");
    }

    if (!arm_parse_joint(ctx, joint_text, found))
    {
        return true;
    }

    if ((percent < 0) || (percent > 100))
    {
        return ctx.reply_fmt(32, "strength is 0..100%%");
    }

    ArmManager& arm = ArmManager::get();
    uint32_t done = 0;

    for (uint32_t index = 0; index < arm.count(); ++index)
    {
        if (((found == ArmManager::ALL_JOINTS) || (index == (uint32_t)found)) &&
            arm.set_strength(index, (uint16_t)(percent * 10)))
        {
            ++done;
        }
    }

    return ctx.reply_fmt(48, "%u joints at %d%%", (unsigned int)done, (int)percent);
}

bool Speed::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view joint_text;
    std::string_view speed_text;
    std::string_view acceleration_text;
    int found = 0;
    int32_t speed = 0;
    int32_t acceleration = 20;

    if (!arm_next(args, joint_text) || !arm_next(args, speed_text) || !arm_parse_int(speed_text, speed))
    {
        return ctx.reply("expected speed/<joint>/<steps per second>[/<acceleration>]");
    }

    if (!arm_parse_joint(ctx, joint_text, found))
    {
        return true;
    }

    if (arm_next(args, acceleration_text) && !arm_parse_int(acceleration_text, acceleration))
    {
        return ctx.reply_fmt(128, "[%.*s] is not an acceleration",
                         (int)acceleration_text.size(), acceleration_text.data());
    }

    if ((speed < 1) || (speed > ST3215_MAX_SPEED) || (acceleration < 0) || (acceleration > 254))
    {
        return ctx.reply_fmt(64, "speed is 1..%u steps/s, acceleration 0..254", (unsigned int)ST3215_MAX_SPEED);
    }

    ArmManager& arm = ArmManager::get();
    uint32_t done = 0;

    for (uint32_t index = 0; index < arm.count(); ++index)
    {
        if (((found == ArmManager::ALL_JOINTS) || (index == (uint32_t)found)) &&
            arm.set_speed(index, (uint16_t)speed, (uint8_t)acceleration))
        {
            ++done;
        }
    }

    return ctx.reply_fmt(48, "%u joints at %d steps/s", (unsigned int)done, (int)speed);
}

MQTT_COMMAND(Scan);
WS_COMMAND(Scan);

MQTT_COMMAND(ScanBaud);
WS_COMMAND(ScanBaud);

MQTT_COMMAND(Bus);
WS_COMMAND(Bus);

MQTT_COMMAND(Baud);
WS_COMMAND(Baud);

MQTT_COMMAND(BusBaud);
WS_COMMAND(BusBaud);

MQTT_COMMAND(SetId);
WS_COMMAND(SetId);

MQTT_COMMAND(Torque);
WS_COMMAND(Torque);

MQTT_COMMAND(Strength);
WS_COMMAND(Strength);

MQTT_COMMAND(Speed);
WS_COMMAND(Speed);

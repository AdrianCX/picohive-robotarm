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

#pragma once

#include "command_registration.h"

struct Scan
{
    static constexpr std::string_view name = "scan";
    static constexpr std::string_view help = "scan - look for servos on the bus";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Baud
{
    static constexpr std::string_view name = "baud";
    static constexpr std::string_view help = "baud/<joint|all>/<rate> - the rate a servo speaks, in its EEPROM";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct BusBaud
{
    static constexpr std::string_view name = "busbaud";
    static constexpr std::string_view help = "busbaud/<rate> - the rate the pico speaks, until the next boot";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Bus
{
    static constexpr std::string_view name = "bus";
    static constexpr std::string_view help = "bus - drive the data line by hand and report the levels";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct ScanBaud
{
    static constexpr std::string_view name = "scanbaud";
    static constexpr std::string_view help = "scanbaud - look for servos at every baudrate, not just ours";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct SetId
{
    static constexpr std::string_view name = "setid";
    static constexpr std::string_view help = "setid/<from>/<to|joint> - rename a servo, one unassigned one on the bus";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Torque
{
    static constexpr std::string_view name = "torque";
    static constexpr std::string_view help = "torque/<joint>/<on|off> - hold, or go limp";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Strength
{
    static constexpr std::string_view name = "strength";
    static constexpr std::string_view help = "strength/<joint>/<percent> - how hard it may push";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Speed
{
    static constexpr std::string_view name = "speed";
    static constexpr std::string_view help = "speed/<joint>/<steps per second>[/<acceleration>]";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

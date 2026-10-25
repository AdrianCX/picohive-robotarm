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

struct State
{
    static constexpr std::string_view name = "state";
    static constexpr std::string_view help = "state - every joint as JSON";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Status
{
    static constexpr std::string_view name = "status";
    static constexpr std::string_view help = "status - every joint, in words";
    static constexpr std::string_view ai_help = "status - each joint: angle, limits, volts, temperature, moving";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";
    static constexpr std::string_view telegram_prefix = "/";

    bool on_header(CommandContext& ctx);
};

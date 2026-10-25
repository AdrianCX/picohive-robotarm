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

struct Move
{
    static constexpr std::string_view name = "move";
    static constexpr std::string_view help = "move/<joint>/<degrees>[/<speed>] - move a joint to an angle";
    static constexpr std::string_view ai_help = "move/<joint>/<deg> - 1 pan 2 lift 3 elbow 4 wrist 5 roll 6 grip";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Jog
{
    static constexpr std::string_view name = "jog";
    static constexpr std::string_view help = "jog/<joint>/<degrees> - move a joint by that much";
    static constexpr std::string_view ai_help = "jog/<joint>/<deg> - turn a joint by that much from where it is";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Step
{
    static constexpr std::string_view name = "step";
    static constexpr std::string_view help = "step/<joint>/<0..4095> - move a joint to a raw position";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Joints
{
    static constexpr std::string_view name = "joints";
    static constexpr std::string_view help = "joints/<1>/<2>/<3>/<4>/<5>/<6> - each joint to an angle, - leaves it";
    static constexpr std::string_view ai_help = "joints/<pan>/<lift>/<elbow>/<wrist>/<roll>/<grip> deg, - skips";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Home
{
    static constexpr std::string_view name = "home";
    static constexpr std::string_view help = "home[/<joint>] - to the middle of the calibrated travel";
    static constexpr std::string_view ai_help = "home[/<joint>] - every joint, or one, to the middle of travel";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct Stop
{
    static constexpr std::string_view name = "stop";
    static constexpr std::string_view help = "stop[/<joint>] - stop and hold where it is";
    static constexpr std::string_view ai_help = "stop[/<joint>] - hold where it is; use if anything looks wrong";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

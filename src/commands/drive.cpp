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

#include "os_platform.h"

#include "arm_args.h"
#include "chassis.h"
#include "drive.h"
#include "pico_logger.h"

bool Drive::on_header(CommandContext& ctx)
{
    std::string_view args = ctx.args;
    std::string_view left_text;
    std::string_view right_text;
    int32_t left = 0;
    int32_t right = 0;

    if (!arm_next(args, left_text) || !arm_next(args, right_text) || !args.empty()
        || !arm_parse_int(left_text, left) || !arm_parse_int(right_text, right))
    {
        trace("drive: expected drive/<left>/<right>, got [%.*s]", (int)ctx.args.size(), ctx.args.data());
        return true;
    }

    Chassis::get().drive(to_us_since_boot(get_absolute_time()), (int)left, (int)right);
    return true;
}

MQTT_COMMAND(Drive);
WS_COMMAND(Drive);

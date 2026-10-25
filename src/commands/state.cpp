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

#include "arm.h"
#include "state.h"

bool State::on_header(CommandContext& ctx)
{
    char text[2000];
    ArmManager::get().state_json(text, sizeof(text));

    return ctx.reply(text);
}

bool Status::on_header(CommandContext& ctx)
{
    char text[2000];
    ArmManager::get().status_text(text, sizeof(text));

    return ctx.reply(text);
}

MQTT_COMMAND(State);
WS_COMMAND(State);

MQTT_COMMAND(Status);
WS_COMMAND(Status);
TELEGRAM_COMMAND(Status);
AI_COMMAND(Status);
AI_CONTEXT(Status);

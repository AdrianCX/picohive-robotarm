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

#include <stdint.h>

#include <string_view>

#include "command_table.h"
#include "general_config.h"

#define LINE_STREAM_MAX_LINES (MAX_POSES + 2)
#define LINE_STREAM_LINE_BYTES 512

class LineStream
{
public:
    virtual ~LineStream() = default;

    bool begin(CommandContext& ctx, std::string_view topic);
    bool pump(CommandContext& ctx);

protected:
    virtual uint32_t line_count() const = 0;

    virtual uint32_t line(uint32_t index, char *out, uint32_t size) = 0;

private:
    uint16_t m_length[LINE_STREAM_MAX_LINES] = {};
    uint32_t m_count = 0;
    uint32_t m_index = 0;
};

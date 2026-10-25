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

#include <string.h>

#include "line_stream.h"

bool LineStream::begin(CommandContext& ctx, std::string_view topic)
{
    uint32_t total = 0;
    char text[LINE_STREAM_LINE_BYTES];

    m_count = (line_count() < LINE_STREAM_MAX_LINES) ? line_count() : LINE_STREAM_MAX_LINES;
    m_index = 0;

    for (uint32_t index = 0; index < m_count; ++index)
    {
        m_length[index] = (uint16_t)line(index, text, sizeof(text));
        total += m_length[index];
    }

    if (!ctx.begin_stream(topic, total))
    {
        return false;
    }

    return pump(ctx);
}

bool LineStream::pump(CommandContext& ctx)
{
    char text[LINE_STREAM_LINE_BYTES];

    while (m_index < m_count)
    {
        uint32_t len = m_length[m_index];

        if (len == 0)
        {
            ++m_index;
            continue;
        }

        if (ctx.send_space() < len)
        {
            ctx.send_more_later();
            return true;
        }

        uint32_t now = line(m_index, text, sizeof(text));

        if (now < len)
        {
            memset(&text[now], ' ', len - now);
        }

        if (!ctx.send_chunk((const uint8_t *)text, len))
        {
            return false;
        }

        ++m_index;
    }

    ctx.sending_done();
    return true;
}

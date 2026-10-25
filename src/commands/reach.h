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
#include "line_stream.h"

struct Reach
{
    static constexpr std::string_view name = "reach";
    static constexpr std::string_view help = "reach/<x>/<y>/<z>[/<pitch>] - the jaws to a point, mm";
    static constexpr std::string_view ai_help = "reach/<x>/<y>/<z>[/<pitch>] - jaws to a point, mm, as where says";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

class PosesWhereLines : public LineStream
{
protected:
    uint32_t line_count() const override { return MAX_POSES + 1; }
    uint32_t line(uint32_t index, char *out, uint32_t size) override;
};

struct PosesWhere
{
    static constexpr std::string_view name = "poses/where";
    static constexpr std::string_view help = "poses/where - every saved pose as the point reach takes, mm";
    static constexpr std::string_view ai_help = "poses/where - each pose as a joints command, x,y,z, description";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    static constexpr bool streams_output = true;

    bool on_header(CommandContext& ctx) { return m_lines.begin(ctx, name); }
    bool on_send_space(CommandContext& ctx) { return m_lines.pump(ctx); }
    void on_abort(CommandContext&, const char *) {}

private:
    PosesWhereLines m_lines;
};

struct Where
{
    static constexpr std::string_view name = "where";
    static constexpr std::string_view help = "where - the point between the jaws, mm, as reach takes it";
    static constexpr std::string_view ai_help = "where - the arm as a joints command, and the jaws' x,y,z in mm";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

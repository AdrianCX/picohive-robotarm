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
#include "poses.h"

struct PoseCommand
{
    static constexpr std::string_view name = "pose";
    static constexpr std::string_view help = "pose/<save|load|delete>/<name>, pose/stop - named positions of the arm";
    static constexpr std::string_view ai_help = "pose/load|save|delete/<name>, pose/stop - saved arm positions";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    bool on_header(CommandContext& ctx);
};

struct PoseDescribe
{
    static constexpr std::string_view name = "pose/describe";
    static constexpr std::string_view help = "pose/describe/<name>[/<text>] - what a saved pose is, read or set";
    static constexpr std::string_view ai_help = "pose/describe/<name>[/<text>] - read or set what a pose is";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    static constexpr Payload payload = Payload::Buffered;
    static constexpr uint32_t max_bytes = 128;

    bool on_payload(CommandContext& ctx, std::string_view body);
};

class PosesJson : public LineStream
{
public:
    char going[POSE_NAME_MAX] = {};

protected:
    uint32_t line_count() const override { return MAX_POSES + 2; }
    uint32_t line(uint32_t index, char *out, uint32_t size) override;
};

struct PosesCommand
{
    static constexpr std::string_view name = "poses";
    static constexpr std::string_view help = "poses - every stored pose, as JSON";
    static constexpr std::string_view ai_help = "poses - the saved poses and their joints, as JSON";
    static constexpr std::string_view mqtt_prefix = "send/";
    static constexpr std::string_view ws_prefix = "/rc/";

    static constexpr bool streams_output = true;

    bool on_header(CommandContext& ctx);
    bool on_send_space(CommandContext& ctx) { return m_json.pump(ctx); }
    void on_abort(CommandContext&, const char *) {}

private:
    PosesJson m_json;
};

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

#include "general_config.h"

struct Pose
{
    char name[POSE_NAME_MAX] = {};
    uint8_t used = 0;
    uint8_t joints = 0;
    uint16_t position[ARM_JOINT_COUNT] = {};
    char description[POSE_DESCRIPTION_MAX] = {};

    bool has(uint32_t index) const { return (joints & (1u << index)) != 0; }
};

class PoseStore
{
public:
    void load();
    bool save();

    uint32_t count() const;
    const Pose *at(uint32_t index) const;

    Pose *find(std::string_view name);

    Pose *add(std::string_view name);

    bool remove(std::string_view name);

    bool describe(Pose& pose, std::string_view text);

    static bool is_name(std::string_view name);

private:
    Pose m_pose[MAX_POSES];
};

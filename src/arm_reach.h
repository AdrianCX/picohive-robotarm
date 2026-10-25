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

class ArmReach
{
public:
    static ArmReach& get();

    bool where(const char *&why);

    bool forward(const uint16_t *position, const char *&why);

    double m_pitch = 0;
    double m_now[4] = {};
    double m_x = 0;
    double m_y = 0;
    double m_z = 0;

private:
    bool mapping(const char *&why);

    double m_zero[4] = {};
    double m_sign[4] = {};

    uint16_t m_position[4] = {};
};

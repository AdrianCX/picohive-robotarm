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

    bool solve(int32_t x, int32_t y, int32_t z, bool pitch_given, int32_t pitch, const char *&why);

    bool where(const char *&why);

    bool forward(const uint16_t *position, const char *&why);

    bool go(const char *&why);

    bool towards(int32_t x, int32_t y, int32_t z, const char *&why);

    double m_q[4] = {};
    double m_pitch = 0;
    double m_now[4] = {};
    double m_x = 0;
    double m_y = 0;
    double m_z = 0;

private:
    bool mapping(const char *&why);
    bool solve_at(double x, double y, double z, double pitch, bool elbow_up);

    double m_zero[4] = {};
    double m_sign[4] = {};
    double m_low[4] = {};
    double m_high[4] = {};

    uint16_t m_position[4] = {};
    double m_try[4] = {};
    double m_best[4] = {};
    double m_best_pitch = 0;
    double m_margin = 0;
    const char *m_why = "";
};

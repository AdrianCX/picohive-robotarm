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

#include "motor.h"

class Chassis
{
public:
    static Chassis& get();

    void initialize();

    void drive(uint64_t now_us, int left, int right, uint64_t duration_us = 0);

    void update(uint64_t now_us);

    bool moving() const { return (m_left != 0) || (m_right != 0); }

    int left() const { return m_left; }
    int right() const { return m_right; }

private:
    Chassis() = default;

    Motor m_left_motors[2];
    Motor m_right_motors[2];

    int m_left = 0;
    int m_right = 0;
    uint64_t m_lastDriveUs = 0;
    uint64_t m_stopAtUs = 0;
    bool m_initialized = false;
};

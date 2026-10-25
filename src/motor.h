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

class Motor
{
public:
    Motor() = default;

    bool initialize(int gpioForward, int gpioBack);
    void applyPower(int power);

private:
    static int slice_of(int gpio);
    static int channel_of(int gpio);
    static bool setup_slice(int slice, int gpio, uint32_t intervalUs, uint16_t wrap);

    int m_gpioForward = 0;
    int m_gpioBack = 0;

    static const uint32_t INTERVAL_US = 20 * 1000;
    static const uint16_t TIME_SLICES = 5000;

    static const int32_t DUTY_FLOOR = 1500;
    static const int32_t DUTY_RANGE = 3500;
};

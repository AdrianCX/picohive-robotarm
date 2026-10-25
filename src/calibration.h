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

#include "general_config.h"

struct ArmCalibration
{
    int16_t zero[ARM_JOINT_COUNT] = {};
    int8_t direction[ARM_JOINT_COUNT] = {};
    uint8_t from = 0;

    int16_t scale[ARM_JOINT_COUNT] = {};

    int16_t scale_of(uint32_t index) const
    {
        return (scale[index] != 0) ? scale[index] : 1000;
    }

    bool known() const;
};

class CalibrationStore
{
public:
    void load();
    bool save();

    const ArmCalibration& get() const { return m_calibration; }
    void set(const ArmCalibration& calibration) { m_calibration = calibration; }

    void forget();

private:
    ArmCalibration m_calibration;
};

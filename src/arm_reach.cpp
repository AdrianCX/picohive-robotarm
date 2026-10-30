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

#include <math.h>

#include "arm.h"
#include "arm_reach.h"

static const double UPPER = 116.0;
static const double FORE = 135.0;
static const double TIP = 100.0;
static const double SHOULDER_Z = 66.0 + 119.0;
static const double SHOULDER_R = 30.6;
static const double DEG = M_PI / 180.0;

ArmReach& ArmReach::get()
{
    static ArmReach instance;
    return instance;
}

bool ArmReach::mapping(const char *&why)
{
    ArmManager& arm = ArmManager::get();
    const ArmCalibration& cal = arm.calibration().get();

    for (uint32_t j = 0; j < 4; ++j)
    {
        ST3215& servo = arm.servo(j);

        if (!arm.joint(j).present || !servo.is_calibrated())
        {
            why = "pan, lift, elbow and wrist all need their limits taught first (Arm tab)";
            return false;
        }

        if (cal.direction[j] == 0)
        {
            why = "no mapping from servo angles to the arm's shape yet (Reach tab, calibrate)";
            return false;
        }

        m_zero[j] = cal.zero[j] / 10.0;
        m_sign[j] = cal.direction[j];
    }

    return true;
}

bool ArmReach::where(const char *&why)
{
    ArmManager& arm = ArmManager::get();

    for (uint32_t j = 0; j < 4; ++j)
    {
        if (!arm.joint(j).state_valid)
        {
            why = "no reading from the servos yet";
            return false;
        }

        m_position[j] = arm.joint(j).state.position;
    }

    return forward(m_position, why);
}

bool ArmReach::forward(const uint16_t *position, const char *&why)
{
    if (!mapping(why))
    {
        return false;
    }

    for (uint32_t j = 0; j < 4; ++j)
    {
        m_now[j] = ((ArmManager::position_to_deci(position[j]) / 10.0) - m_zero[j]) * m_sign[j];
    }

    double a2 = m_now[1] * DEG;
    double a3 = a2 + (m_now[2] * DEG);
    double a4 = a3 + (m_now[3] * DEG);
    double r = SHOULDER_R + (UPPER * sin(a2)) + (FORE * sin(a3)) + (TIP * sin(a4));

    m_x = r * cos(m_now[0] * DEG);
    m_y = r * sin(m_now[0] * DEG);
    m_z = SHOULDER_Z + (UPPER * cos(a2)) + (FORE * cos(a3)) + (TIP * cos(a4));
    m_pitch = a4 / DEG;
    return true;
}

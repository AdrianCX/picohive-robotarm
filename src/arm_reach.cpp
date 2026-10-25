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

        double a = ((ArmManager::position_to_deci(servo.min_position()) / 10.0) - m_zero[j]) * m_sign[j];
        double b = ((ArmManager::position_to_deci(servo.max_position()) / 10.0) - m_zero[j]) * m_sign[j];

        m_low[j] = (a < b) ? a : b;
        m_high[j] = (a < b) ? b : a;
    }

    return true;
}

bool ArmReach::solve_at(double x, double y, double z, double pitch, bool elbow_up)
{
    double r = sqrt((x * x) + (y * y));
    double dr = (r - (TIP * sin(pitch))) - SHOULDER_R;
    double dz = (z - (TIP * cos(pitch))) - SHOULDER_Z;
    double d = sqrt((dr * dr) + (dz * dz));

    if ((d > (UPPER + FORE)) || (d < fabs(UPPER - FORE)) || (d < 1e-9))
    {
        m_why = (d > (UPPER + FORE)) ? "too far" : "too close in";
        return false;
    }

    double c = ((d * d) - (UPPER * UPPER) - (FORE * FORE)) / (2 * UPPER * FORE);
    c = (c < -1) ? -1 : ((c > 1) ? 1 : c);

    double q3 = elbow_up ? acos(c) : -acos(c);
    double q2 = atan2(dr, dz) - atan2(FORE * sin(q3), UPPER + (FORE * cos(q3)));
    double q4 = remainder(pitch - q2 - q3, 2 * M_PI);

    m_try[0] = atan2(y, x) / DEG;
    m_try[1] = q2 / DEG;
    m_try[2] = q3 / DEG;
    m_try[3] = q4 / DEG;
    m_margin = 1e9;

    for (uint32_t j = 0; j < 4; ++j)
    {
        if ((m_try[j] < m_low[j]) || (m_try[j] > m_high[j]))
        {
            static const char *PAST[4] = { "pan would go past its limit", "lift would go past its limit",
                                           "elbow would go past its limit", "wrist would go past its limit" };
            m_why = PAST[j];
            return false;
        }

        m_margin = fmin(m_margin, fmin(m_try[j] - m_low[j], m_high[j] - m_try[j]));
    }

    double ze = SHOULDER_Z + (UPPER * cos(q2));
    double zw = ze + (FORE * cos(q2 + q3));

    if ((ze < 0) || (zw < 0) || ((zw + (TIP * cos(pitch))) < 0))
    {
        m_why = "through the floor";
        return false;
    }

    return true;
}

bool ArmReach::solve(int32_t x, int32_t y, int32_t z, bool pitch_given, int32_t pitch, const char *&why)
{
    if (!mapping(why))
    {
        return false;
    }

    bool found = false;
    double best = -1e9;
    m_why = "out of reach";

    for (int32_t deg = (pitch_given ? pitch : 0); deg < (pitch_given ? pitch + 1 : 360); deg += 15)
    {
        for (int up = 1; up >= 0; --up)
        {
            if (!solve_at(x, y, z, deg * DEG, up == 1))
            {
                continue;
            }

            double worth = m_margin + (up ? 12 : 0);

            if (!found || (worth > best))
            {
                found = true;
                best = worth;
                m_pitch = deg;

                for (uint32_t j = 0; j < 4; ++j)
                {
                    m_q[j] = m_try[j];
                }
            }
        }
    }

    why = m_why;
    return found;
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

bool ArmReach::towards(int32_t x, int32_t y, int32_t z, const char *&why)
{
    if (!where(why))
    {
        return false;
    }

    double from_x = m_x;
    double from_y = m_y;
    double from_z = m_z;
    double low = 0;
    double high = 1;
    bool found = false;

    for (int step = 0; step < 12; ++step)
    {
        double mid = (low + high) / 2;
        const char *ignored = NULL;

        if (solve((int32_t)lround(from_x + ((x - from_x) * mid)), (int32_t)lround(from_y + ((y - from_y) * mid)),
                  (int32_t)lround(from_z + ((z - from_z) * mid)), false, 0, ignored))
        {
            found = true;
            low = mid;
            m_best_pitch = m_pitch;

            for (uint32_t j = 0; j < 4; ++j)
            {
                m_best[j] = m_q[j];
            }
        }
        else
        {
            high = mid;
        }
    }

    if (!found)
    {
        why = "not even a little of the way";
        return false;
    }

    for (uint32_t j = 0; j < 4; ++j)
    {
        m_q[j] = m_best[j];
    }

    m_pitch = m_best_pitch;

    m_x = from_x + ((x - from_x) * low);
    m_y = from_y + ((y - from_y) * low);
    m_z = from_z + ((z - from_z) * low);
    return true;
}

bool ArmReach::go(const char *&why)
{
    ArmManager& arm = ArmManager::get();

    for (uint32_t j = 0; j < 4; ++j)
    {
        if (!arm.move_deci(j, (int32_t)lround(((m_q[j] * m_sign[j]) + m_zero[j]) * 10.0)))
        {
            why = (arm.blocked(j) != NULL) ? arm.blocked(j) : "a joint refused the move";
            return false;
        }
    }

    return true;
}

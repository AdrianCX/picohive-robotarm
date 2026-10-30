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

#include "os_platform.h"

#include "chassis.h"
#include "general_config.h"
#include "pico_logger.h"

Chassis& Chassis::get()
{
    static Chassis instance;
    return instance;
}

void Chassis::initialize()
{
    if (m_initialized)
    {
        return;
    }

    m_left_motors[0].initialize(MOTOR_LEFT_FRONT_FORWARD, MOTOR_LEFT_FRONT_BACK);
    m_left_motors[1].initialize(MOTOR_LEFT_REAR_FORWARD, MOTOR_LEFT_REAR_BACK);

    m_right_motors[0].initialize(MOTOR_RIGHT_FRONT_FORWARD, MOTOR_RIGHT_FRONT_BACK);
    m_right_motors[1].initialize(MOTOR_RIGHT_REAR_FORWARD, MOTOR_RIGHT_REAR_BACK);

    gpio_init(MOTOR_DRIVER_SLEEP_PIN);
    gpio_set_drive_strength(MOTOR_DRIVER_SLEEP_PIN, GPIO_DRIVE_STRENGTH_8MA);
    gpio_set_dir(MOTOR_DRIVER_SLEEP_PIN, GPIO_OUT);
    gpio_put(MOTOR_DRIVER_SLEEP_PIN, 1);

    m_initialized = true;
}

static int clamp_power(int power)
{
    if (power > MOTOR_MAX_POWER)
    {
        return MOTOR_MAX_POWER;
    }

    return (power < -MOTOR_MAX_POWER) ? -MOTOR_MAX_POWER : power;
}

void Chassis::drive(uint64_t now_us, int left, int right, uint64_t duration_us)
{
    left = clamp_power(left);
    right = clamp_power(right);

    m_lastDriveUs = now_us;
    m_stopAtUs = (duration_us > 0) ? (now_us + duration_us) : 0;

    if ((left == m_left) && (right == m_right))
    {
        return;
    }

    trace("Chassis::drive: left=%d right=%d", left, right);

    m_left = left;
    m_right = right;

    for (Motor& motor : m_left_motors)
    {
        motor.applyPower(left);
    }

    for (Motor& motor : m_right_motors)
    {
        motor.applyPower(right);
    }
}

void Chassis::update(uint64_t now_us)
{
    if (m_stopAtUs != 0)
    {
        if (now_us >= m_stopAtUs)
        {
            trace("Chassis::update: timed drive over, stopping");
            drive(now_us, 0, 0);
        }

        return;
    }

#if DRIVE_TIMEOUT_US > 0
    if (((m_left != 0) || (m_right != 0)) && ((now_us - m_lastDriveUs) > DRIVE_TIMEOUT_US))
    {
        trace("Chassis::update: nothing for %u ms, stopping", (unsigned int)((now_us - m_lastDriveUs) / 1000));
        drive(now_us, 0, 0);
    }
#endif
}

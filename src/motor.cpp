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

#include "general_config.h"
#include "pico_logger.h"

#include "motor.h"

bool Motor::initialize(int gpioForward, int gpioBack)
{
    m_gpioForward = gpioForward;
    m_gpioBack = gpioBack;

    return setup_slice(slice_of(m_gpioForward), m_gpioForward, INTERVAL_US, TIME_SLICES)
        && setup_slice(slice_of(m_gpioBack), m_gpioBack, INTERVAL_US, TIME_SLICES);
}

void Motor::applyPower(int power)
{
#if !MOTOR_PWM

    if (power == 0)
    {
        gpio_put(m_gpioForward, 1);
        gpio_put(m_gpioBack, 1);
    }
    else if (power > 0)
    {
        gpio_put(m_gpioForward, 1);
        gpio_put(m_gpioBack, 0);
    }
    else
    {
        gpio_put(m_gpioForward, 0);
        gpio_put(m_gpioBack, 1);
    }

#else

    if (power == 0)
    {
        pwm_set_chan_level(slice_of(m_gpioForward), channel_of(m_gpioForward), 0);
        pwm_set_chan_level(slice_of(m_gpioBack), channel_of(m_gpioBack), 0);
        return;
    }

    int magnitude = (power > 0) ? power : -power;
    int32_t duty = (DUTY_RANGE * magnitude) / 100 + DUTY_FLOOR;

    int driven = (power > 0) ? m_gpioForward : m_gpioBack;
    int idle = (power > 0) ? m_gpioBack : m_gpioForward;

    pwm_set_chan_level(slice_of(idle), channel_of(idle), 0);
    pwm_set_chan_level(slice_of(driven), channel_of(driven), (uint16_t)duty);

#endif
}

int Motor::slice_of(int gpio)
{
    return (gpio / 2) % 8;
}

int Motor::channel_of(int gpio)
{
    return ((gpio % 2) == 0) ? PWM_CHAN_A : PWM_CHAN_B;
}

bool Motor::setup_slice(int slice, int gpio, uint32_t intervalUs, uint16_t wrap)
{
    gpio_init(gpio);
    gpio_set_dir(gpio, GPIO_OUT);
    gpio_put(gpio, 0);

#if !MOTOR_PWM
    (void)slice;
    (void)intervalUs;
    (void)wrap;
    return true;
#else

    pwm_set_phase_correct(slice, true);

    uint32_t sourceHz = clock_get_hz(clk_sys);
    uint32_t usPerWrap = intervalUs / 2;
    uint32_t clockRateNeeded = (1000000u / usPerWrap) * wrap;
    uint32_t clockDiv = sourceHz / clockRateNeeded;

    if ((clockDiv < 1) || (clockDiv > 256))
    {
        trace("Motor::setup_slice: gpio[%d] clockDiv[%u] outside 1..256, pwm will not be the interval asked for",
              gpio, (unsigned int)clockDiv);
        return false;
    }

    pwm_set_wrap(slice, wrap);
    pwm_set_clkdiv(slice, clockDiv);

    gpio_set_function(gpio, GPIO_FUNC_PWM);
    pwm_set_chan_level(slice, channel_of(gpio), 0);
    pwm_set_enabled(slice, true);
    return true;

#endif
}

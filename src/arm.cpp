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

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "os_platform.h"

#include "arm.h"
#include "pico_logger.h"

ArmManager& ArmManager::get()
{
    static ArmManager instance;
    return instance;
}

ArmManager::ArmManager()
    : m_servo{
#define ARM_JOINT(ID, NAME, SHORT) ST3215(m_bus, ID),
        ARM_JOINTS
#undef ARM_JOINT
      }
{
    uint32_t index = 0;

#define ARM_JOINT(ID, NAME, SHORT)          \
    m_joint[index].id = ID;                 \
    m_joint[index].name = NAME;             \
    m_joint[index].short_name = SHORT;      \
    ++index;
    ARM_JOINTS
#undef ARM_JOINT
}

bool ArmManager::initialize()
{
    ST3215BusConfig config;
    config.uart = ARM_UART;
    config.tx_gpio = ARM_TX_GPIO;
    config.rx_gpio = ARM_RX_GPIO;
    config.baudrate = ARM_BAUDRATE;

    if (!m_bus.begin(config))
    {
        trace("arm: the servo bus did not start");
        return false;
    }

    m_started = true;

    m_poses.load();
    m_calibration.load();

    uint32_t found = scan();
    trace("arm: %u of %u joints answered", (unsigned int)found, (unsigned int)count());

    for (uint32_t index = 0; index < count(); ++index)
    {
        m_servo[index].set_default_motion(1200, 20);
    }

    return true;
}

uint32_t ArmManager::scan()
{
    uint32_t found = 0;

    m_stray_count = 0;
    m_conflict_count = 0;

    for (uint32_t index = 0; index < count(); ++index)
    {
        m_joint[index].present = m_started && m_servo[index].begin();
        m_joint[index].state_valid = false;

        if (m_joint[index].present)
        {
            ++found;

            uint8_t volts = m_servo[index].last_voltage();

            if (volts > 0)
            {
                m_joint[index].state.voltage = volts;
                m_joint[index].state.temperature = m_servo[index].last_temperature();

                if (!m_joint[index].volt_seen || (volts < m_joint[index].volt_low))
                {
                    m_joint[index].volt_low = volts;
                }

                if (!m_joint[index].volt_seen || (volts > m_joint[index].volt_high))
                {
                    m_joint[index].volt_high = volts;
                }

                m_joint[index].volt_seen = true;
            }
        }

        if (m_started && m_bus.saw_noise())
        {
            note_conflict(m_joint[index].id);
        }
    }

    for (uint8_t id = 0; m_started && (id <= ARM_SCAN_MAX_ID); ++id)
    {
        bool expected = false;

        for (uint32_t index = 0; index < count(); ++index)
        {
            expected = expected || (m_joint[index].id == id);
        }

        if (expected)
        {
            continue;
        }

        if (m_bus.probe(id) && (m_stray_count < (ARM_SCAN_MAX_ID + 1)))
        {
            m_stray[m_stray_count++] = id;
        }

        if (m_bus.saw_noise())
        {
            note_conflict(id);
        }
    }

    if ((found == 0) && m_started)
    {
        trace("ArmManager::scan: nothing answered on any id. The last readings taken before that:");

        for (uint32_t index = 0; index < count(); ++index)
        {
            if (!m_joint[index].volt_seen)
            {
                trace("ArmManager::scan:   %s (id %u): never read", m_joint[index].short_name,
                      (unsigned int)m_joint[index].id);
                continue;
            }

            trace("ArmManager::scan:   %s (id %u): %u.%uV, ever %u.%uV to %u.%uV, %uC, load %d",
                  m_joint[index].short_name, (unsigned int)m_joint[index].id,
                  (unsigned int)(m_joint[index].state.voltage / 10),
                  (unsigned int)(m_joint[index].state.voltage % 10),
                  (unsigned int)(m_joint[index].volt_low / 10),
                  (unsigned int)(m_joint[index].volt_low % 10),
                  (unsigned int)(m_joint[index].volt_high / 10),
                  (unsigned int)(m_joint[index].volt_high % 10),
                  (unsigned int)m_joint[index].state.temperature,
                  (int)m_joint[index].state.load);
        }

        trace("ArmManager::scan: every id silent at %u baud. In order of how often it is the answer: the "
              "servos are on a different baudrate to this (scanbaud sweeps all eight and says where they "
              "are); the chain is too long for this rate, which makes every servo on it go deaf at once and "
              "is what 115200 is the default for; the 12V or the ground is off. If the voltages above are "
              "steady the supply is not it, and the bus command drives the line by hand to rule out the "
              "levels",
              (unsigned int)m_bus.baudrate());
    }

    {
        uint8_t now_low = 0;
        uint8_t now_high = 0;
        uint8_t ever_low = 0;
        uint8_t ever_high = 0;
        uint32_t heard = 0;

        for (uint32_t index = 0; index < count(); ++index)
        {
            if (!m_joint[index].volt_seen)
            {
                continue;
            }

            uint8_t volts = m_joint[index].state.voltage;

            if ((heard == 0) || (volts < now_low)) now_low = volts;
            if ((heard == 0) || (volts > now_high)) now_high = volts;
            if ((heard == 0) || (m_joint[index].volt_low < ever_low)) ever_low = m_joint[index].volt_low;
            if ((heard == 0) || (m_joint[index].volt_high > ever_high)) ever_high = m_joint[index].volt_high;

            ++heard;
        }

        if (heard == 0)
        {
            trace("ArmManager::scan: supply: nothing has reported a voltage yet");
        }
        else
        {
            trace("ArmManager::scan: supply: %u.%uV to %u.%uV across %u servo%s now, %u.%uV to %u.%uV ever "
                  "seen - a spread of %u.%uV%s",
                  (unsigned int)(now_low / 10), (unsigned int)(now_low % 10),
                  (unsigned int)(now_high / 10), (unsigned int)(now_high % 10),
                  (unsigned int)heard, (heard == 1) ? "" : "s",
                  (unsigned int)(ever_low / 10), (unsigned int)(ever_low % 10),
                  (unsigned int)(ever_high / 10), (unsigned int)(ever_high % 10),
                  (unsigned int)((ever_high - ever_low) / 10), (unsigned int)((ever_high - ever_low) % 10),
                  ((ever_high - ever_low) >= 10)
                      ? " - which is a supply that cannot hold up under what the servos draw"
                      : " - so the supply is not what is wrong");
        }
    }

    trace("ArmManager::scan: %u of %u joints, %u unclaimed id%s, %u id%s answering badly",
          (unsigned int)found, (unsigned int)count(),
          (unsigned int)m_stray_count, (m_stray_count == 1) ? "" : "s",
          (unsigned int)m_conflict_count, (m_conflict_count == 1) ? "" : "s");

    for (uint32_t which = 0; which < m_conflict_count; ++which)
    {
        trace("ArmManager::scan: id %u had something to say that was not an answer - two servos on that id "
              "talking over each other, or a reply the bus mangled. Unplug until one servo answers to it, "
              "then give the odd one out an id of its own",
              (unsigned int)m_conflict[which]);
    }

    return found;
}

uint32_t ArmManager::scan_baudrates(char *out, uint32_t size)
{
    uint32_t total = 0;
    int pos = 0;

    if (!m_started)
    {
        snprintf(out, size, "the bus was never opened");
        return 0;
    }

    uint32_t was = m_bus.baudrate();

    for (uint8_t code = 0; code < 8; ++code)
    {
        uint32_t rate = st3215_baud_of(code);

        if ((rate == 0) || !m_bus.set_baudrate(rate))
        {
            continue;
        }

        uint32_t here = 0;

        for (uint8_t id = 0; id <= ARM_SCAN_MAX_ID; ++id)
        {
            if (!m_bus.probe(id))
            {
                continue;
            }

            ++here;
            ++total;

            trace("ArmManager::scan_baudrates: id %u answers at %u baud (code %u)",
                  (unsigned int)id, (unsigned int)rate, (unsigned int)code);

            if ((pos >= 0) && (pos < (int)size))
            {
                pos += snprintf(&out[pos], size - pos, "%s%u baud: id %u",
                                (pos > 0) ? ", " : "", (unsigned int)rate, (unsigned int)id);
            }
        }

        if (here == 0)
        {
            trace("ArmManager::scan_baudrates: nothing at %u baud (code %u)",
                  (unsigned int)rate, (unsigned int)code);
        }
    }

    m_bus.set_baudrate(was);

    scan();

    if (total == 0)
    {
        snprintf(out, size, "nothing answered at any baudrate - so this is not a baudrate: no 12V, no shared "
                            "ground, or a supply the servos have pulled under their minimum");
    }

    return total;
}

void ArmManager::note_conflict(uint8_t id)
{
    for (uint32_t which = 0; which < m_conflict_count; ++which)
    {
        if (m_conflict[which] == id)
        {
            return;
        }
    }

    if (m_conflict_count < (ARM_SCAN_MAX_ID + 1))
    {
        m_conflict[m_conflict_count++] = id;
    }
}

void ArmManager::update(uint64_t now_us)
{
    if (!m_started)
    {
        return;
    }

    if ((now_us - m_last_calibrate_us) >= ARM_CALIBRATE_INTERVAL_US)
    {
        m_last_calibrate_us = now_us;

        for (uint32_t index = 0; index < count(); ++index)
        {
            if (m_servo[index].is_calibrating())
            {
                m_servo[index].calibrate_update();
            }
        }
    }

    pose_update(now_us);

    if ((now_us - m_last_poll_us) < ARM_POLL_INTERVAL_US)
    {
        return;
    }

    m_last_poll_us = now_us;

    for (uint32_t tried = 0; tried < count(); ++tried)
    {
        uint32_t index = m_next_poll;
        m_next_poll = (m_next_poll + 1) % count();

        if (!m_joint[index].present)
        {
            continue;
        }

        m_joint[index].state_valid = m_servo[index].read_state(m_joint[index].state);

        if (m_joint[index].state_valid && (index != ARM_GRIPPER) && m_servo[index].torque_on() && (m_bus.last_error() & ST3215_ERROR_OVERLOAD))
        {
            m_servo[index].move_to(m_joint[index].state.position);
        }

        if (m_joint[index].state_valid && (m_joint[index].state.voltage > 0))
        {
            uint8_t volts = m_joint[index].state.voltage;

            if (!m_joint[index].volt_seen || (volts < m_joint[index].volt_low))
            {
                m_joint[index].volt_low = volts;
            }

            if (!m_joint[index].volt_seen || (volts > m_joint[index].volt_high))
            {
                m_joint[index].volt_high = volts;
            }

            m_joint[index].volt_seen = true;
        }

        return;
    }
}

int ArmManager::find(std::string_view text) const
{
    if ((text == "all") || (text == "*"))
    {
        return ALL_JOINTS;
    }

    if ((text.size() == 1) && (text[0] >= '1') && (text[0] <= '9'))
    {
        uint32_t number = text[0] - '1';
        return (number < count()) ? (int)number : NO_JOINT;
    }

    for (uint32_t index = 0; index < count(); ++index)
    {
        if ((text == m_joint[index].name) || (text == m_joint[index].short_name))
        {
            return (int)index;
        }
    }

    return NO_JOINT;
}

const char *ArmManager::blocked(uint32_t index)
{
    if (!m_joint[index].present)
    {
        return "not plugged in - run scan once it is";
    }

    if (m_servo[index].is_calibrating())
    {
        return "being calibrated - finish or cancel first";
    }

    if (!m_servo[index].is_calibrated())
    {
        return "not calibrated - moves are refused until it is";
    }

    return NULL;
}

bool ArmManager::move_position(uint32_t index, uint16_t position)
{
    if (blocked(index) != NULL)
    {
        return false;
    }

    pose_stop();

    return m_servo[index].move_to(position);
}

bool ArmManager::move_deci(uint32_t index, int32_t deci_degrees)
{
    return move_position(index, deci_to_position(deci_degrees));
}

bool ArmManager::move_deci_at(uint32_t index, int32_t deci_degrees, uint16_t speed)
{
    if (blocked(index) != NULL)
    {
        return false;
    }

    pose_stop();

    return m_servo[index].move_to(deci_to_position(deci_degrees), speed,
                                  m_servo[index].default_acceleration());
}

bool ArmManager::jog_deci(uint32_t index, int32_t deci_degrees)
{
    if (blocked(index) != NULL)
    {
        return false;
    }

    uint16_t position = 0;

    if (!m_servo[index].read_position(position))
    {
        return false;
    }

    return move_position(index, deci_to_position(position_to_deci(position) + deci_degrees));
}

bool ArmManager::home(uint32_t index)
{
    if (blocked(index) != NULL)
    {
        return false;
    }

    uint32_t middle = ((uint32_t)m_servo[index].min_position() + m_servo[index].max_position()) / 2;
    return move_position(index, (uint16_t)middle);
}

bool ArmManager::stop(uint32_t index)
{
    pose_stop();

    if (!m_joint[index].present)
    {
        return false;
    }

    if (m_servo[index].is_calibrating())
    {
        m_servo[index].calibrate_cancel();
        return true;
    }

    return m_servo[index].stop();
}

bool ArmManager::set_torque(uint32_t index, bool on)
{
    if (!on)
    {
        pose_stop();
    }

    return m_joint[index].present && m_servo[index].set_torque(on);
}

bool ArmManager::set_speed(uint32_t index, uint16_t speed, uint8_t acceleration)
{
    if (!m_joint[index].present)
    {
        return false;
    }

    m_servo[index].set_default_motion(speed, acceleration);
    return true;
}

bool ArmManager::set_strength(uint32_t index, uint16_t limit)
{
    return m_joint[index].present && m_servo[index].set_torque_limit(limit);
}

bool ArmManager::holding(int32_t& short_deci) const
{
    const ArmJoint& joint = m_joint[ARM_GRIPPER];
    uint16_t goal = 0;

    if (!joint.present || !joint.state_valid || joint.state.moving || !m_servo[ARM_GRIPPER].goal(goal))
    {
        return false;
    }

    int32_t steps = abs((int32_t)goal - (int32_t)joint.state.position);

    short_deci = abs(position_to_deci(goal) - position_to_deci(joint.state.position));
    return steps > ARM_GRIP_SHORT_STEPS;
}

bool ArmManager::calibrate_start(uint32_t index)
{
    return m_joint[index].present && m_servo[index].calibrate_start();
}

bool ArmManager::calibrate_finish(uint32_t index, uint16_t margin)
{
    return m_joint[index].present && m_servo[index].calibrate_finish(margin);
}

void ArmManager::calibrate_cancel(uint32_t index)
{
    m_servo[index].calibrate_cancel();
}

void ArmManager::calibrate_cancel_id(uint8_t id)
{
    for (uint32_t index = 0; index < count(); ++index)
    {
        if (m_joint[index].id == id)
        {
            m_servo[index].calibrate_cancel();
        }
    }
}

uint8_t ArmManager::spare_id() const
{
    for (uint8_t id = 1; id <= ARM_SCAN_MAX_ID; ++id)
    {
        bool taken = false;

        for (uint32_t index = 0; index < count(); ++index)
        {
            taken = taken || (m_joint[index].id == id);
        }

        for (uint32_t which = 0; which < m_stray_count; ++which)
        {
            taken = taken || (m_stray[which] == id);
        }

        for (uint32_t which = 0; which < m_conflict_count; ++which)
        {
            taken = taken || (m_conflict[which] == id);
        }

        if (!taken)
        {
            return id;
        }
    }

    return 0;
}

bool ArmManager::set_middle_here(uint32_t index)
{
    if (!m_joint[index].present)
    {
        return false;
    }

    m_servo[index].calibrate_cancel();

    return m_servo[index].set_middle_here();
}

bool ArmManager::set_limits(uint32_t index, uint16_t min, uint16_t max)
{
    return m_joint[index].present && m_servo[index].set_limits(min, max);
}

bool ArmManager::clear_limits(uint32_t index)
{
    return m_joint[index].present && m_servo[index].clear_limits();
}

bool ArmManager::capture(Pose& pose)
{
    pose.joints = 0;

    for (uint32_t index = 0; index < count(); ++index)
    {
        if (!m_joint[index].present || !m_joint[index].state_valid || !m_servo[index].is_calibrated())
        {
            continue;
        }

        pose.position[index] = m_joint[index].state.position;
        pose.joints |= (1u << index);
    }

    return (pose.joints != 0);
}

bool ArmManager::pose_play(const Pose& pose)
{
    if (pose.joints == 0)
    {
        return false;
    }

    for (uint32_t index = 0; index < count(); ++index)
    {
        if (m_servo[index].is_calibrating())
        {
            trace("arm: not going to a pose while something is being calibrated");
            return false;
        }
    }

    m_play = PosePlay();
    m_play.active = true;
    m_play.joints = pose.joints;
    m_play.started_us = to_us_since_boot(get_absolute_time());

    memcpy(m_play.name, pose.name, sizeof(m_play.name));
    m_play.name[POSE_NAME_MAX - 1] = 0;

    for (uint32_t index = 0; index < count(); ++index)
    {
        m_play.target[index] = pose.position[index];

        if (pose.has(index) && (blocked(index) != NULL))
        {
            trace("arm: %s is in the pose but %s - leaving it out", m_joint[index].name, blocked(index));
            m_play.joints &= ~(1u << index);
        }
    }

    if (m_play.joints == 0)
    {
        m_play.active = false;
        return false;
    }

    trace("arm: going to pose [%s]", m_play.name);
    return true;
}

void ArmManager::pose_stop()
{
    if (!m_play.active)
    {
        return;
    }

    trace("arm: stopped going to pose [%s]", m_play.name);
    m_play.active = false;
}

uint16_t ArmManager::pose_distance(const Pose& pose)
{
    uint16_t worst = 0;

    for (uint32_t index = 0; index < count(); ++index)
    {
        if (!pose.has(index) || !m_joint[index].present || !m_joint[index].state_valid)
        {
            continue;
        }

        int32_t away = (int32_t)m_joint[index].state.position - pose.position[index];

        if (away < 0)
        {
            away = -away;
        }

        if (away > worst)
        {
            worst = (uint16_t)away;
        }
    }

    return worst;
}

void ArmManager::pose_update(uint64_t now_us)
{
    if (!m_play.active)
    {
        return;
    }

    if ((now_us - m_play.stepped_us) < POSE_STEP_INTERVAL_US)
    {
        return;
    }

    m_play.stepped_us = now_us;

    uint32_t waiting = 0;

    for (uint32_t index = 0; index < count(); ++index)
    {
        if (!(m_play.joints & (1u << index)))
        {
            continue;
        }

        int32_t away = (int32_t)m_joint[index].state.position - m_play.target[index];

        if ((away >= -POSE_TOLERANCE) && (away <= POSE_TOLERANCE))
        {
            continue;
        }

        ++waiting;

        uint16_t goal = m_play.target[index];

        if (m_play.has_sent[index] && (m_play.sent[index] == goal))
        {
            continue;
        }

        if (m_servo[index].move_to(goal))
        {
            m_play.sent[index] = goal;
            m_play.has_sent[index] = true;
        }
    }

    if (waiting == 0)
    {
        trace("arm: pose [%s] reached", m_play.name);
        m_play.active = false;
        return;
    }

    if ((now_us - m_play.started_us) > POSE_TIMEOUT_US)
    {
        trace("arm: gave up on pose [%s], %u joints never got there", m_play.name, (unsigned int)waiting);
        m_play.active = false;
    }
}

bool ArmManager::settled() const
{
    if (m_play.active)
    {
        return false;
    }

    for (uint32_t index = 0; index < count(); ++index)
    {
        if (m_joint[index].present && m_joint[index].state_valid && m_joint[index].state.moving)
        {
            return false;
        }
    }

    return true;
}

int32_t ArmManager::position_to_deci(uint16_t position)
{
    int32_t offset = (int32_t)position - ST3215_MIDDLE;
    int32_t deci = (offset * 3600) / ST3215_STEPS;

    return deci;
}

uint16_t ArmManager::deci_to_position(int32_t deci_degrees)
{
    int32_t position = ST3215_MIDDLE + ((deci_degrees * ST3215_STEPS) / 3600);

    if (position < 0)
    {
        position = 0;
    }
    if (position > ST3215_MAX_POSITION)
    {
        position = ST3215_MAX_POSITION;
    }

    return (uint16_t)position;
}

uint32_t ArmManager::state_json(char *out, uint32_t size)
{
    int pos = snprintf(out, size, "{\"joints\":[");

    for (uint32_t index = 0; (index < count()) && (pos > 0) && (pos < (int)size); ++index)
    {
        const ArmJoint& joint = m_joint[index];
        ST3215& servo = m_servo[index];
        const ST3215Range& range = servo.calibration_range();

        int written = snprintf(&out[pos], size - pos,
            "%s{\"n\":\"%s\",\"s\":\"%s\",\"id\":%u,\"here\":%u,\"cal\":%u,\"caling\":%u,"
            "\"min\":%u,\"max\":%u,"
            "\"pos\":%u,\"deci\":%d,\"mindeci\":%d,\"maxdeci\":%d,"
            "\"moving\":%u,\"load\":%d,\"temp\":%u,\"volt\":%u,\"seen\":%u,"
            "\"seenmin\":%u,\"seenmax\":%u,\"wrapped\":%u}",
            (index > 0) ? "," : "",
            joint.name, joint.short_name, (unsigned int)joint.id,
            joint.present ? 1u : 0u,
            servo.is_calibrated() ? 1u : 0u,
            servo.is_calibrating() ? 1u : 0u,
            (unsigned int)servo.min_position(), (unsigned int)servo.max_position(),
            (unsigned int)joint.state.position,
            (int)position_to_deci(joint.state.position),
            (int)position_to_deci(servo.min_position()),
            (int)position_to_deci(servo.max_position()),
            joint.state.moving ? 1u : 0u,
            (int)joint.state.load,
            (unsigned int)joint.state.temperature,
            (unsigned int)joint.state.voltage,
            joint.state_valid ? 1u : 0u,
            (unsigned int)(range.empty ? 0 : range.min),
            (unsigned int)(range.empty ? 0 : range.max),
            range.wrapped ? 1u : 0u);

        if (written < 0)
        {
            break;
        }

        pos += written;
    }

    if ((pos > 0) && (pos < (int)size))
    {
        int written = snprintf(&out[pos], size - pos, "],\"strays\":[");

        if (written > 0)
        {
            pos += written;
        }
    }

    for (uint32_t which = 0; (which < m_stray_count) && (pos > 0) && (pos < (int)size); ++which)
    {
        int written = snprintf(&out[pos], size - pos, "%s%u",
                               (which > 0) ? "," : "", (unsigned int)m_stray[which]);

        if (written < 0)
        {
            break;
        }

        pos += written;
    }

    if ((pos > 0) && (pos < (int)size))
    {
        int written = snprintf(&out[pos], size - pos, "],\"conflicts\":[");

        if (written > 0)
        {
            pos += written;
        }
    }

    for (uint32_t which = 0; (which < m_conflict_count) && (pos > 0) && (pos < (int)size); ++which)
    {
        int written = snprintf(&out[pos], size - pos, "%s%u",
                               (which > 0) ? "," : "", (unsigned int)m_conflict[which]);

        if (written < 0)
        {
            break;
        }

        pos += written;
    }

    if ((pos > 0) && (pos < (int)size))
    {
        int written = snprintf(&out[pos], size - pos,
                               "],\"spare\":%u,\"error\":%u,\"pose\":\"%s\"}",
                               (unsigned int)spare_id(),
                               (unsigned int)m_bus.last_error(),
                               m_play.active ? m_play.name : "");

        if (written > 0)
        {
            pos += written;
        }
    }

    if ((pos < 0) || (pos >= (int)size))
    {
        pos = snprintf(out, size, "{\"joints\":[],\"error\":0}");
    }

    return (uint32_t)pos;
}

uint32_t ArmManager::status_text(char *out, uint32_t size)
{
    int pos = 0;

    for (uint32_t index = 0; (index < count()) && (pos >= 0) && (pos < (int)size); ++index)
    {
        const ArmJoint& joint = m_joint[index];
        ST3215& servo = m_servo[index];

        if (!joint.present)
        {
            pos += snprintf(&out[pos], size - pos, "%u %s (id %u): not plugged in\n",
                            (unsigned int)(index + 1), joint.name, (unsigned int)joint.id);
            continue;
        }

        if (servo.is_calibrating())
        {
            const ST3215Range& range = servo.calibration_range();

            pos += snprintf(&out[pos], size - pos, "%u %s: calibrating, seen %u..%u%s\n",
                            (unsigned int)(index + 1), joint.name,
                            (unsigned int)(range.empty ? 0 : range.min),
                            (unsigned int)(range.empty ? 0 : range.max),
                            range.wrapped ? " (wrapped - center it)" : "");
            continue;
        }

        if (!joint.state_valid)
        {
            pos += snprintf(&out[pos], size - pos, "%u %s: no reading yet\n", (unsigned int)(index + 1), joint.name);
            continue;
        }

        int32_t deci = position_to_deci(joint.state.position);
        int32_t low = position_to_deci(servo.min_position());
        int32_t high = position_to_deci(servo.max_position());

        int32_t past = (deci < low) ? (low - deci) : ((deci > high) ? (deci - high) : 0);

        pos += snprintf(&out[pos], size - pos, "%u %s: %s%d.%d deg, %s %d..%d deg",
                        (unsigned int)(index + 1), joint.name,
                        ((deci < 0) && (deci > -10)) ? "-" : "", (int)(deci / 10), (int)(((deci < 0) ? -deci : deci) % 10),
                        servo.is_calibrated() ? "limits" : "NOT CALIBRATED, limits", (int)(low / 10), (int)(high / 10));

        if (servo.is_calibrated() && (past > 0) && (pos < (int)size))
        {
            pos += snprintf(&out[pos], size - pos, " (%d.%d deg past the %s limit: normal at rest against a stop, moves stay inside)",
                            (int)(past / 10), (int)(past % 10), (deci < low) ? "low" : "high");
        }
        else if (servo.is_calibrated() && (pos < (int)size))
        {
            pos += snprintf(&out[pos], size - pos, " (inside)");
        }

        if (pos < (int)size)
        {
            pos += snprintf(&out[pos], size - pos, ", %u.%uV %uC, load %d%% %dmA%s",
                            (unsigned int)(joint.state.voltage / 10), (unsigned int)(joint.state.voltage % 10),
                            (unsigned int)joint.state.temperature, (int)(joint.state.load / 10),
                            (int)((joint.state.current * 65) / 10), joint.state.moving ? ", moving" : "");
        }

        int32_t short_deci = 0;

        if ((index == ARM_GRIPPER) && (pos < (int)size))
        {
            pos += holding(short_deci)
                ? snprintf(&out[pos], size - pos, ", holding something (stopped %d.%d deg short of its goal)",
                           (int)(short_deci / 10), (int)(short_deci % 10))
                : snprintf(&out[pos], size - pos, ", holding nothing");
        }

        if (pos < (int)size)
        {
            pos += snprintf(&out[pos], size - pos, "\n");
        }
    }

    if (pos <= 0)
    {
        pos = snprintf(out, size, "no joints");
    }

    return (uint32_t)((pos < (int)size) ? pos : (size - 1));
}

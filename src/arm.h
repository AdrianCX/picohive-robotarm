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

#include <string_view>

#include "general_config.h"
#include "calibration.h"
#include "poses.h"
#include "st3215.h"

struct PosePlay
{
    bool active = false;
    char name[POSE_NAME_MAX] = {};

    uint32_t joints = 0;
    uint16_t target[ARM_JOINT_COUNT] = {};
    uint16_t sent[ARM_JOINT_COUNT] = {};
    bool has_sent[ARM_JOINT_COUNT] = {};

    uint64_t started_us = 0;
    uint64_t stepped_us = 0;
};

struct ArmJoint
{
    uint8_t id = 0;
    const char *name = "";
    const char *short_name = "";

    bool present = false;

    bool state_valid = false;
    ST3215State state;

    uint8_t volt_low = 0;
    uint8_t volt_high = 0;
    bool volt_seen = false;
};

class ArmManager
{
public:
    static ArmManager& get();

    bool initialize();

    uint32_t scan();

    uint32_t stray_count() const { return m_stray_count; }
    uint8_t stray(uint32_t which) const { return m_stray[which]; }

    uint32_t conflict_count() const { return m_conflict_count; }
    uint8_t conflict(uint32_t which) const { return m_conflict[which]; }

    uint32_t scan_baudrates(char *out, uint32_t size);

    uint8_t spare_id() const;

    void calibrate_cancel_id(uint8_t id);

    void update(uint64_t now_us);

    static constexpr uint32_t count() { return ARM_JOINT_COUNT; }
    const ArmJoint& joint(uint32_t index) const { return m_joint[index]; }
    ST3215& servo(uint32_t index) { return m_servo[index]; }
    ST3215Bus& bus() { return m_bus; }

    static constexpr int ALL_JOINTS = -1;
    static constexpr int NO_JOINT = -2;
    int find(std::string_view text) const;

    const char *blocked(uint32_t index);

    PoseStore& poses() { return m_poses; }

    CalibrationStore& calibration() { return m_calibration; }

    bool capture(Pose& pose);

    bool pose_play(const Pose& pose);
    void pose_stop();
    bool is_playing() const { return m_play.active; }

    bool settled() const;
    const PosePlay& playing() const { return m_play; }

    uint16_t pose_distance(const Pose& pose);

    bool move_position(uint32_t index, uint16_t position);
    bool move_deci(uint32_t index, int32_t deci_degrees);

    bool move_deci_at(uint32_t index, int32_t deci_degrees, uint16_t speed);
    bool jog_deci(uint32_t index, int32_t deci_degrees);

    bool home(uint32_t index);

    bool stop(uint32_t index);
    bool set_torque(uint32_t index, bool on);
    bool set_speed(uint32_t index, uint16_t speed, uint8_t acceleration);

    bool set_strength(uint32_t index, uint16_t limit);

    bool calibrate_start(uint32_t index);
    bool calibrate_finish(uint32_t index, uint16_t margin);
    void calibrate_cancel(uint32_t index);
    bool is_calibrating(uint32_t index) { return m_servo[index].is_calibrating(); }

    bool set_middle_here(uint32_t index);
    bool set_limits(uint32_t index, uint16_t min, uint16_t max);
    bool clear_limits(uint32_t index);

    static int32_t position_to_deci(uint16_t position);
    static uint16_t deci_to_position(int32_t deci_degrees);

    uint32_t state_json(char *out, uint32_t size);

    uint32_t status_text(char *out, uint32_t size);

private:
    ArmManager();

    void pose_update(uint64_t now_us);
    void note_conflict(uint8_t id);

    ST3215Bus m_bus;
    ST3215 m_servo[ARM_JOINT_COUNT];
    ArmJoint m_joint[ARM_JOINT_COUNT];

    PoseStore m_poses;
    CalibrationStore m_calibration;
    PosePlay m_play;

    bool m_started = false;

    uint8_t m_stray[ARM_SCAN_MAX_ID + 1] = {};
    uint32_t m_stray_count = 0;
    uint8_t m_conflict[ARM_SCAN_MAX_ID + 1] = {};
    uint32_t m_conflict_count = 0;

    uint32_t m_next_poll = 0;
    uint64_t m_last_poll_us = 0;
    uint64_t m_last_calibrate_us = 0;
};

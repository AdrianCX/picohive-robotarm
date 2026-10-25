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

#include <string.h>

#include "app_config.h"
#include "calibration.h"
#include "pico_logger.h"

#define CALIBRATION_MAGIC   0x43414c42
#define CALIBRATION_VERSION 2

struct CalibrationFile
{
    uint32_t magic = 0;
    uint16_t version = 0;
    uint16_t joints = 0;
    ArmCalibration calibration;
};

struct CalibrationFileV1
{
    uint32_t magic = 0;
    uint16_t version = 0;
    uint16_t joints = 0;
    int16_t zero[ARM_JOINT_COUNT] = {};
    int8_t direction[ARM_JOINT_COUNT] = {};
    uint8_t from = 0;
};

bool ArmCalibration::known() const
{
    for (uint32_t index = 0; index < ARM_JOINT_COUNT; ++index)
    {
        if (direction[index] == 0)
        {
            return false;
        }
    }

    return true;
}

static bool load_v1(ArmCalibration& into)
{
    CalibrationFileV1 file;

    if (!read_static_file(CALIBRATION_FILE, (uint8_t *)&file, sizeof(file)))
    {
        return false;
    }

    if ((file.magic != CALIBRATION_MAGIC) || (file.version != 1)
        || (file.joints != ARM_JOINT_COUNT))
    {
        return false;
    }

    into = ArmCalibration();

    for (uint32_t index = 0; index < ARM_JOINT_COUNT; ++index)
    {
        into.zero[index] = file.zero[index];
        into.direction[index] = file.direction[index];
    }

    into.from = file.from;

    trace("calibration: %s is the older format, read without scales", CALIBRATION_FILE);
    return true;
}

void CalibrationStore::load()
{
    m_calibration = ArmCalibration();

    CalibrationFile file;

    if (!read_static_file(CALIBRATION_FILE, (uint8_t *)&file, sizeof(file)))
    {
        if (!load_v1(m_calibration))
        {
            trace("calibration: no %s", CALIBRATION_FILE);
            return;
        }
    }
    else if ((file.magic != CALIBRATION_MAGIC) || (file.version != CALIBRATION_VERSION)
             || (file.joints != ARM_JOINT_COUNT))
    {
        if (load_v1(m_calibration))
        {
        }
        else
        {
            if (file.magic != 0)
            {
                trace("calibration: %s is not this firmware's (magic %08x, version %d, %d joints), ignoring it",
                      CALIBRATION_FILE, (unsigned int)file.magic, (int)file.version, (int)file.joints);
            }

            return;
        }
    }
    else
    {
        m_calibration = file.calibration;
    }

    trace("calibration: from %s, %s", CALIBRATION_FILE,
          m_calibration.known() ? "every joint set" : "incomplete, so not used");
}

bool CalibrationStore::save()
{
    CalibrationFile file;

    file.magic = CALIBRATION_MAGIC;
    file.version = CALIBRATION_VERSION;
    file.joints = ARM_JOINT_COUNT;
    file.calibration = m_calibration;

    if (!write_static_file(CALIBRATION_FILE, (uint8_t *)&file, sizeof(file)))
    {
        trace("calibration: could not write %s", CALIBRATION_FILE);
        return false;
    }

    trace("calibration: written to %s", CALIBRATION_FILE);
    return true;
}

void CalibrationStore::forget()
{
    m_calibration = ArmCalibration();
    save();
}

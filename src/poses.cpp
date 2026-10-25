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
#include "pico_logger.h"
#include "poses.h"

#include <stdlib.h>

#define POSE_MAGIC      0x504f5345
#define POSE_VERSION    3

struct PoseV1
{
    char name[POSE_NAME_MAX];
    uint8_t used;
    uint8_t joints;
    uint16_t position[ARM_JOINT_COUNT];
};

struct PoseV2
{
    char name[POSE_NAME_MAX];
    uint8_t used;
    uint8_t joints;
    uint16_t position[ARM_JOINT_COUNT];
    char description[POSE_DESCRIPTION_MAX];
};

struct PoseFile
{
    uint32_t magic = 0;
    uint16_t version = 0;
    uint16_t joints = 0;
    uint16_t count = 0;
    uint16_t reserved = 0;
    union
    {
        Pose pose[MAX_POSES];
        PoseV1 pose_v1[MAX_POSES];
        PoseV2 pose_v2[MAX_POSES];
    };

    PoseFile() : pose() {}
};

void PoseStore::load()
{
    for (uint32_t index = 0; index < MAX_POSES; ++index)
    {
        m_pose[index] = Pose();
    }

    PoseFile *file = new PoseFile();

    if (!read_static_file(POSE_FILE, (uint8_t *)file, sizeof(*file)))
    {
        trace("poses: no %s", POSE_FILE);
        delete file;
        return;
    }

    if ((file->magic != POSE_MAGIC) || (file->version < 1) || (file->version > POSE_VERSION) || (file->joints != ARM_JOINT_COUNT))
    {
        if (file->magic != 0)
        {
            trace("poses: %s is not this firmware's (magic %08x, version %d, %d joints), ignoring it",
                  POSE_FILE, (unsigned int)file->magic, (int)file->version, (int)file->joints);
        }

        delete file;
        return;
    }

    uint32_t kept = 0;

    for (uint32_t index = 0; index < MAX_POSES; ++index)
    {
        Pose& pose = m_pose[kept];

        if (file->version == 1)
        {
            const PoseV1& old = file->pose_v1[index];

            memcpy(pose.name, old.name, POSE_NAME_MAX);
            pose.used = old.used;
            pose.joints = old.joints;
            memcpy(pose.position, old.position, sizeof(pose.position));
        }
        else if (file->version == 2)
        {
            const PoseV2& old = file->pose_v2[index];

            memcpy(pose.name, old.name, POSE_NAME_MAX);
            pose.used = old.used;
            pose.joints = old.joints;
            memcpy(pose.position, old.position, sizeof(pose.position));
            memcpy(pose.description, old.description, POSE_DESCRIPTION_MAX);
        }
        else
        {
            pose = file->pose[index];
        }

        pose.name[POSE_NAME_MAX - 1] = 0;
        pose.description[POSE_DESCRIPTION_MAX - 1] = 0;

        if (pose.used && (pose.name[0] != 0))
        {
            ++kept;
        }
        else
        {
            pose = Pose();
        }
    }

    trace("poses: %u from %s, version %d", (unsigned int)kept, POSE_FILE, (int)file->version);
    delete file;
}

bool PoseStore::save()
{
    PoseFile *file = new PoseFile();

    file->magic = POSE_MAGIC;
    file->version = POSE_VERSION;
    file->joints = ARM_JOINT_COUNT;
    file->count = (uint16_t)count();

    for (uint32_t index = 0; index < MAX_POSES; ++index)
    {
        file->pose[index] = m_pose[index];
    }

    bool written = write_static_file(POSE_FILE, (uint8_t *)file, sizeof(*file));
    delete file;

    if (!written)
    {
        trace("poses: could not write %s", POSE_FILE);
        return false;
    }

    return true;
}

bool PoseStore::describe(Pose& pose, std::string_view text)
{
    uint32_t len = 0;

    for (char c : text)
    {
        if (len >= (POSE_DESCRIPTION_MAX - 1))
        {
            break;
        }

        pose.description[len++] = ((c == '"') || (c == '\\') || ((unsigned char)c < 0x20)) ? ' ' : c;
    }

    pose.description[len] = 0;
    return save();
}

uint32_t PoseStore::count() const
{
    uint32_t used = 0;

    for (uint32_t index = 0; index < MAX_POSES; ++index)
    {
        used += m_pose[index].used ? 1 : 0;
    }

    return used;
}

const Pose *PoseStore::at(uint32_t index) const
{
    return (index < MAX_POSES) ? &m_pose[index] : NULL;
}

bool PoseStore::is_name(std::string_view name)
{
    if (name.empty() || (name.size() >= POSE_NAME_MAX))
    {
        return false;
    }

    for (char letter : name)
    {
        bool ok = ((letter >= 'a') && (letter <= 'z')) ||
                  ((letter >= 'A') && (letter <= 'Z')) ||
                  ((letter >= '0') && (letter <= '9')) ||
                  (letter == '-') || (letter == '_');

        if (!ok)
        {
            return false;
        }
    }

    return true;
}

Pose *PoseStore::find(std::string_view name)
{
    for (uint32_t index = 0; index < MAX_POSES; ++index)
    {
        if (m_pose[index].used && (name == m_pose[index].name))
        {
            return &m_pose[index];
        }
    }

    return NULL;
}

Pose *PoseStore::add(std::string_view name)
{
    if (!is_name(name))
    {
        return NULL;
    }

    Pose *pose = find(name);

    if (pose != NULL)
    {
        return pose;
    }

    for (uint32_t index = 0; index < MAX_POSES; ++index)
    {
        if (!m_pose[index].used)
        {
            m_pose[index] = Pose();
            m_pose[index].used = 1;
            memcpy(m_pose[index].name, name.data(), name.size());
            m_pose[index].name[name.size()] = 0;
            return &m_pose[index];
        }
    }

    trace("poses: no room for another, there are %d", MAX_POSES);
    return NULL;
}

bool PoseStore::remove(std::string_view name)
{
    Pose *pose = find(name);

    if (pose == NULL)
    {
        return false;
    }

    *pose = Pose();
    return true;
}

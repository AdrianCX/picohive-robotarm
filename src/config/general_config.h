#ifndef _GENERAL_CONFIG_H
#define _GENERAL_CONFIG_H

#define ARM_UART            uart0
#define ARM_TX_GPIO         0
#define ARM_RX_GPIO         1
#define ARM_BAUDRATE        115200

#define ARM_JOINTS      \
    ARM_JOINT(1, "shoulder_pan",  "pan")    \
    ARM_JOINT(2, "shoulder_lift", "lift")   \
    ARM_JOINT(3, "elbow_flex",    "elbow")  \
    ARM_JOINT(4, "wrist_flex",    "wrist")  \
    ARM_JOINT(5, "wrist_roll",    "roll")   \
    ARM_JOINT(6, "gripper",       "grip")

#ifdef __cplusplus
#define ARM_JOINT(ID, NAME, SHORT) +1
static constexpr unsigned int ARM_JOINT_COUNT = 0 ARM_JOINTS;
#undef ARM_JOINT

static constexpr unsigned int ARM_GRIPPER = ARM_JOINT_COUNT - 1;
#endif

#define MAX_POSES           24
#define POSE_NAME_MAX       16
#define POSE_DESCRIPTION_MAX 64
#define POSE_FILE           "poses.bin"

#define CALIBRATION_FILE    "armcal.bin"

#define POSE_STEP_INTERVAL_US   100000

#define POSE_TOLERANCE      10

#define POSE_TIMEOUT_US     20000000

#define ARM_GRIP_SHORT_STEPS    34

#define ARM_SCAN_MAX_ID     12

#define ARM_POLL_INTERVAL_US    30000

#define ARM_CALIBRATE_INTERVAL_US 15000

#define MOTOR_LEFT_FRONT_FORWARD 17
#define MOTOR_LEFT_FRONT_BACK 16
#define MOTOR_LEFT_REAR_FORWARD 15
#define MOTOR_LEFT_REAR_BACK 14

#define MOTOR_RIGHT_FRONT_FORWARD 18
#define MOTOR_RIGHT_FRONT_BACK 19
#define MOTOR_RIGHT_REAR_FORWARD 12
#define MOTOR_RIGHT_REAR_BACK 13

#define MOTOR_DRIVER_SLEEP_PIN 20

#define MOTOR_MAX_POWER 100

#define MOTOR_PWM 1

#define DRIVE_TIMEOUT_US (1500 * 1000)

#define DRIVE_MAX_MS 10000

#endif

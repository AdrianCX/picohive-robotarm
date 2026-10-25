cmake_minimum_required(VERSION 3.12)

include(${CMAKE_CURRENT_LIST_DIR}/os/pico_os.cmake)

pico_os_pre_project()

project(robotarm C CXX ASM)

pico_os_init()

set(APP_SOURCES
  src/main.cpp
  src/arm.cpp
  src/poses.cpp
  src/calibration.cpp
  src/chassis.cpp
  src/motor.cpp
  src/arm_reach.cpp
  src/line_stream.cpp
  )

set(APP_LIBRARIES
  pico_common
  pico_st3215
  pico_openai
  )

if(NOT PICO_OS_PLATFORM STREQUAL "linux")
  list(APPEND APP_LIBRARIES hardware_pwm)
endif()

add_executable(robotarm ${APP_SOURCES})

pico_os_web_page(robotarm ${CMAKE_CURRENT_SOURCE_DIR}/src/web/page.yaml)

pico_os_set_stack_size(robotarm 16384)

target_compile_definitions(robotarm PRIVATE
  PICO_STDIO_STACK_BUFFER_SIZE=1024
  PICO_MALLOC_PANIC=1
  CONFIG_MAX_JSON=4096
  )

target_include_directories(robotarm PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}/src/config
  ${CMAKE_CURRENT_SOURCE_DIR}
  )

target_link_libraries(robotarm ${APP_LIBRARIES})

pico_commands_add(robotarm
  ${CMAKE_CURRENT_SOURCE_DIR}/src/commands
  ${PICO_BUILTIN_COMMANDS}
  ${PICO_SIMPLE_CONFIG_COMMANDS}
  ${PICO_OPENAI_COMMANDS}
  )

#${PICO_TELEGRAM_COMMANDS}
#${PICO_CALENDAR_COMMANDS}

pico_add_extra_outputs(robotarm)

pico_enable_stdio_usb(robotarm 0)
pico_enable_stdio_uart(robotarm 0)

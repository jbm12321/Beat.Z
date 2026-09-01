cmake_minimum_required(VERSION 3.22)
project(BeatZGeneratedPlugin VERSION {{VERSION}})
set(BEATZ_BUNDLE_IDENTIFIER "{{BUNDLE_IDENTIFIER}}")

if(NOT DEFINED IPLUG2_DIR OR NOT DEFINED FAUST_INCLUDE_DIR)
  message(FATAL_ERROR "IPLUG2_DIR and FAUST_INCLUDE_DIR are required")
endif()

include(${IPLUG2_DIR}/iPlug2.cmake)
find_package(iPlug2 REQUIRED)

iplug_add_plugin(BeatZGeneratedPlugin
  SOURCES BeatZGeneratedPlugin.cpp BeatZGeneratedPlugin.h BeatZStaticChain.hpp
  RESOURCES ${IPLUG2_DIR}/Examples/IPlugEffect/resources/fonts/Roboto-Regular.ttf
  FORMATS VST3
  DEFINES SAMPLE_TYPE_FLOAT
)

target_include_directories(BeatZGeneratedPlugin-vst3 PRIVATE ${FAUST_INCLUDE_DIR} ${CMAKE_CURRENT_SOURCE_DIR})

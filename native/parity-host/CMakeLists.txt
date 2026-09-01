cmake_minimum_required(VERSION 3.25)
project(BeatZVst3RenderHost LANGUAGES C CXX OBJC OBJCXX)

if(NOT DEFINED VST3_SDK_ROOT)
  message(FATAL_ERROR "VST3_SDK_ROOT is required")
endif()

set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "" FORCE)
add_subdirectory(${VST3_SDK_ROOT} vst3sdk EXCLUDE_FROM_ALL)

add_executable(beatz-vst3-render
  main.cpp
  ${VST3_SDK_ROOT}/public.sdk/source/common/memorystream.cpp
  ${VST3_SDK_ROOT}/public.sdk/source/vst/hosting/plugprovider.cpp
  ${VST3_SDK_ROOT}/public.sdk/source/vst/hosting/module_mac.mm
)
set_source_files_properties(${VST3_SDK_ROOT}/public.sdk/source/vst/hosting/module_mac.mm PROPERTIES COMPILE_OPTIONS -fobjc-arc)
target_link_libraries(beatz-vst3-render PRIVATE base pluginterfaces sdk sdk_common sdk_hosting "-framework Foundation" "-framework CoreFoundation")
target_compile_features(beatz-vst3-render PRIVATE cxx_std_17)

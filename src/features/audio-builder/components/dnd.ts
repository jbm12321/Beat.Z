export const moduleDragKey = 'application/x-effect-module';
export const nodeDragKey = 'application/x-effect-node';

export function moveIndexFromDropZone(currentIndex: number, dropZoneIndex: number) {
  return dropZoneIndex > currentIndex ? dropZoneIndex - 1 : dropZoneIndex;
}

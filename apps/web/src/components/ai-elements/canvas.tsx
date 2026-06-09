import { Background, ReactFlow } from "@xyflow/react";

import "@xyflow/react/dist/style.css";

const deleteKeyCode = ["Backspace", "Delete"];

export const Canvas = ({
  children,
  ...props
}: any) => (
  <ReactFlow
    deleteKeyCode={deleteKeyCode}
    fitView
    panOnDrag={false}
    panOnScroll
    selectionOnDrag={true}
    zoomOnDoubleClick={false}
    {...props}>
    <Background bgColor="var(--sidebar)" />
    {children}
  </ReactFlow>
);

# fly_ply_generator

This repo contains some custom implementations of common geometric algorithms for the purposes of deconstructing a pair of bezier surfaces (shaped like a boat).

The end result of the deconstruction represents the flat material sheets needed to create a close approximation of the 3D shape.

Planes that slice through the surfaces can also be specified, these will be output as blue lines on the flattened sheets, and as unique convex hulls on the plane bounded by the surfaces.

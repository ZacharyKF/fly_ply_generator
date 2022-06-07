import { DivisionCurve, SurfaceCurve } from "../curves/rational_bezier_surface";
import { Point2D } from "../euclidean/rational_point";
import { FlattenNode } from "./flatten_node";
import { LowerNode } from "./lower_node";
import { UpperNode } from "./upper_node";

// Split the nodes recursively, consuming the nodes along the way to prevent
//  re-consuming nodes
export function split_node_recursive(
    node: FlattenNode,
    surface_curves: SurfaceCurve[],
    curves: DivisionCurve[],
    puzzle_tooth_width: number,
    puzzle_tooth_angle: number
) {
    // If we've reached the end, then fill ourselves and return
    if (curves.length == 0) {
        node.fill(surface_curves, 0, puzzle_tooth_width, puzzle_tooth_angle);
        return;
    }

    // Otherwise, try and consume our curves, unshifting along the way
    const curves_copy = [...curves];
    let hull_curve;
    let consumed = false;
    while (!consumed && (hull_curve = curves_copy.shift()) != undefined) {
        consumed = try_split(
            node,
            surface_curves,
            hull_curve,
            puzzle_tooth_width,
            puzzle_tooth_angle
        ).consumed;
    }

    // If we couldn't find anything to consume, we're at the end and can fill
    //  ourselves
    if (!consumed) {
        node.fill(surface_curves, 0, puzzle_tooth_width, puzzle_tooth_angle);
        return;
    }

    // Otherwise Fill our children recursively
    node.children.forEach((child) =>
        split_node_recursive(
            child,
            surface_curves,
            curves_copy,
            puzzle_tooth_width,
            puzzle_tooth_angle
        )
    );
}

// Try to split the node with a given HullCurve. Either return an arry
//  containing [node] or [upper_child, lower_child]
export function try_split(
    node: FlattenNode,
    surface_curves: SurfaceCurve[],
    curve: DivisionCurve,
    puzzle_tooth_width: number,
    puzzle_tooth_angle: number
): {
    consumed: boolean;
    nodes: FlattenNode[];
} {
    // Find our t values at the curve's endpoint
    const curve_end_p = curve.t_curve.get(1);
    const node_end_t_upper = node.upper_bound(curve_end_p.x);
    const node_end_t_lower = node.lower_bound(curve_end_p.x);

    // If it's outside our bounds, we can't create children
    if (curve_end_p.y > node_end_t_upper || curve_end_p.y < node_end_t_lower) {
        return {
            consumed: false,
            nodes: [node],
        };
    }

    // Otherwise, we've reached the end of our node! We can fill it
    const new_dirs = node.fill(
        surface_curves,
        curve.id_end,
        puzzle_tooth_width,
        puzzle_tooth_angle
    );

    // Once filled we can begin creating our new nodes. First we need to
    //  define the boundary between them
    const max_u = surface_curves[curve.id_end].u;
    const curve_bound = (u: number) => {
        return curve.t_curve.get(u/max_u).y;
    };

    const child_draw_down = new UpperNode(
        node.bulkheads.length,
        node.prefix,
        node.depth + 1,
        node.children.length,
        curve.id_end,
        new_dirs,
        node.upper_bound,
        curve_bound
    );
    node.children.push(child_draw_down);

    const child_draw_up = new LowerNode(
        node.bulkheads.length,
        node.prefix,
        node.depth + 1,
        node.children.length,
        curve.id_end,
        new_dirs,
        curve_bound,
        node.lower_bound
    );
    node.children.push(child_draw_up);

    return {
        consumed: true,
        nodes: [child_draw_down, child_draw_up],
    };
}

export function node_as_list(node: FlattenNode): FlattenNode[] {
    let nodes: FlattenNode[] = [node];
    node.children.forEach((child) => {
        nodes.push(...node_as_list(child));
    });
    return nodes;
}

export function node_to_continuous_points(
    node: FlattenNode,
    points: Point2D[]
): Point2D[] {
    points.push(...node.upper_nodes);

    node.children.forEach((child) => {
        node_to_continuous_points(child, points);
    });

    points.push(...node.lower_nodes.reverse());

    return points;
}

export interface FillResult {
    draw_up_ref_dir: number;
    draw_down_ref_dir: number;
    ref_point_upper: Point2D;
    ref_point_lower: Point2D;
    ref_dir_upper: Point2D;
    ref_dir_lower: Point2D;
}

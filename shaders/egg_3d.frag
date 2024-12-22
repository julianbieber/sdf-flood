#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float time;
} u;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;
layout(binding = 3) readonly buffer eyeBuffer {
    float v[];
} eyes;
layout (binding  = 2) readonly buffer SliderParameters{
    float v[];
} sliders;


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0

struct SceneSample {
    float closest_distance;
    int index;
};

struct RayEnd {
    SceneSample s;
    vec3 current_position;
};

vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) * 
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) * 
        mat3(1.0,0.0,0.0,0.0, cos(roll), -sin(roll),0.0, sin(roll), cos(roll))) * 
        p;
}
float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

SceneSample combine(SceneSample a, SceneSample b) {
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
}

vec3 l1_p() {
    return vec3(0.0, 10.0, 6.0);
}

float sdbEllipsoidV1( in vec3 p, in vec3 r )
{
    float k1 = length((p - vec3(0.0, 0.0, 10.0))/r);
    return (k1-1.0)*min(min(r.x,r.y),r.z);
}

vec3 egg_rotate(vec3 p) {
    p = p - vec3(0.0, 0.0, 10.0);
    p = rotate(p, 0.0, u.time, 0.0);
    p = p + vec3(0.0, 0.0, 10.0);
    return p;
}
vec3 egg_rotate_inverse(vec3 p) {
    p = p - vec3(0.0, 0.0, 10.0);
    p = rotate(p, 0.0, -u.time, 0.0);
    p = p + vec3(0.0, 0.0, 10.0);
    return p;
}

float egg(vec3 p) {
    p = egg_rotate(p);
    float e = sdbEllipsoidV1(p, vec3(2.0, 3.0, 2.0));
    e = max(e, -sphere(p, vec3(0.0, -0.30, 9.6), 1.8));
    return e;
}

float snowman(vec3 p) {
    float top = sphere(p, vec3(0.0, 0.21, 9.6), 0.10);
    float middle = sphere(p, vec3(0.0, 0.0, 9.6), 0.15);
    float bottom = sphere(p, vec3(0.0, -0.25, 9.6), 0.2);
    return min(min(top, bottom), middle);
}

vec3 nose_rotate(vec3 p) {
    p = p - vec3(0.0, 0.21, 9.6);
    p = rotate(p, 0.0, 0.0, u.time);
    p = p + vec3(0.0, 0.21, 9.6);


    return p;
}

float nose(vec3 p) {
    p = nose_rotate(p);
    vec2 c = vec2(1.0, 1.0);
    float h = 0.2;

    float q = length(p.xz);
    return max(dot(c.xy,vec2(q,p.y)),-h-p.y);

}


SceneSample scene(vec3 p) {
    SceneSample l = SceneSample(sphere(p, l1_p(), 0.3), 1);
    SceneSample e = SceneSample(egg(p), 2);
    SceneSample s = SceneSample(snowman(p), 3);
    return combine(combine(l, e),s);
}

float scene_f(vec3 p) {
    return scene(p).closest_distance;
}

vec3 normal( in vec3 p ) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps,0);
    return normalize( vec3(scene_f(p+h.xyy) - scene_f(p-h.xyy),
                           scene_f(p+h.yxy) - scene_f(p-h.yxy),
                           scene_f(p+h.yyx) - scene_f(p-h.yyx) ) );
}
float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
}



RayEnd follow_ray(vec3 start, vec3 direction, int steps, float max_dist) {
    float traveled = 0.0;
    for (int i = 0; i < steps; ++i) {
        vec3 p = start + direction * traveled;
        SceneSample s = scene(p);
        if (s.closest_distance < 0.01) {
            return RayEnd(s, p);
        }
        if (traveled >= max_dist) {
            break;
        }
        traveled += s.closest_distance;
    }

    return RayEnd(SceneSample(traveled, -1), start + direction * traveled);
}

vec4 resolve_color(int index, vec3 p) {
    if (index == 1) {
        return vec4(1.0, 1.0, 1.0, 1.0);
    }
    if (index == 2) {
        vec3 n = normal(p);
        float v = dot(n, vec3(1.0, 1.0, 0.3));
        v = max(v, 0.3);

        vec3 rotated_p = egg_rotate(p);
        if (length(rotated_p - vec3(0.0, -0.3, 9.6)) < 1.8) {
            v = 0.4;
            // return vec4(v, v, v, 1.0);
            rotated_p = egg_rotate_inverse(p);
            return vec4(abs(cos(fract(rotated_p) * 23.0 ) ) * v, 1.0);
        } else {
            return vec4(abs(sin(fract(rotated_p) * 40.0 ) ) * v, 1.0);
            
        }

    } 
    if (index == 3) {
        vec3 n = normal(p);
        float v = dot(n, vec3(1.0, 1.0, 0.3));
        v = max(v, 0.5);
        return vec4(v, v, v, 1.0);
    }
    return vec4(0);
}

bool is_light(int index) {
    return index == 1  || index == 2 || index == 3;
}

vec4 render(vec3 eye, vec3 ray) {
    RayEnd end = follow_ray(eye, ray, 100, 100.0);
    if (end.s.index == -1) {
        return vec4(0.0);
    }
    vec4 color = resolve_color(end.s.index, end.current_position);
    return color;
    vec3 light_positions[1] = vec3[](
        l1_p()
    );
    bool at_least_one_light = is_light(end.s.index);
    for (int light_index = 0; light_index < light_positions.length(); ++light_index) {
        vec3 p = light_positions[light_index];
        vec3 light_d = normalize(p - end.current_position);
        RayEnd light_traced = follow_ray(end.current_position + light_d * 0.02, light_d, 100, 50.0);
        if (is_light(light_traced.s.index)) {
            color *= resolve_color(light_traced.s.index, light_traced.current_position);
            at_least_one_light = true;
        }
    }
    if (!at_least_one_light) {
        return color * 0.01;
    }
    return color;
}

void main(){
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0)); 

    out_color = render(vec3(0.0), ray_direction);
    // out_color = vec4(pixel_position, 0.0, 1.0);
    // out_color = vec4(sin(sdFbm(vec3(uv * 40.0, 0.0), 7.0)), 0.0, 0.0, 1.0);
} 
